import joplin from 'api';
import JoplinData from 'api/JoplinData';

async function extractText(path: string): Promise<string> {
	return new Promise((resolve, reject) => {
		pdfToText(path, resolve);
	});
}

async function pdfToText(path, callbackAllDone) {
	let PDFJS = require('pdfjs-dist/es5/build/pdf.js');
	const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry');
	PDFJS.GlobalWorkerOptions.workerSrc = pdfjsWorker;

	PDFJS.getDocument(path).promise.then(function(pdf) {
		let complete = 0;
		let total = pdf.numPages;
		let pages = {};
		// For some (pdf?) reason these don't all come in consecutive
		// order. That's why they're stored as an object and then
		// processed one final time at the end.
		for (let pagei = 1; pagei <= total; pagei++) {
			pdf.getPage(pagei).then(function(page) {
				let pageNumber = page.pageNumber;
				page.getTextContent().then(function(textContent) {
					if (null != textContent.items) {
						let page_text = "";
						let last_item = null;
						for (let itemsi = 0; itemsi < textContent.items.length; itemsi++) {
							let item = textContent.items[itemsi];
							// I think to add whitespace properly would be more complex and
							// would require two loops.
							if (last_item != null && last_item.str[last_item.str.length - 1] != ' ') {
								let itemX = item.transform[5]
								let lastItemX = last_item.transform[5]
								let itemY = item.transform[4]
								let lastItemY = last_item.transform[4]
								if (itemX < lastItemX)
									page_text += "\r\n";
								else if (itemY != lastItemY && (last_item.str.match(/^(\s?[a-zA-Z])$|^(.+\s[a-zA-Z])$/) == null))
									page_text += ' ';
							} // ends if may need to add whitespace

							page_text += item.str;
							last_item = item;
						} // ends for every item of text

						textContent != null && console.log("page " + pageNumber + " finished.") // " content: \n" + page_text);
						pages[pageNumber] = page_text + "\n\n";
					} // ends if has items

					++complete;

					// If all done, put pages in order and combine all
					// text, then pass that to the callback
					if (complete == total) {
						// Using `setTimeout()` isn't a stable way of making sure
						// the process has finished. Watch out for missed pages.
						// A future version might do this with promises.
						setTimeout(function() {
							let full_text = "";
							let num_pages = Object.keys(pages).length;
							for (let pageNum = 1; pageNum <= num_pages; pageNum++)
								full_text += pages[pageNum];
							callbackAllDone(full_text);
						}, 1000);
					}
				}); // ends page.getTextContent().then
			}); // ends page.then
		} // ends for every page
	});
}

async function initDb(path: string) {
	console.log('init db');
	const sqlite3 = joplin.plugins.require('sqlite3');
	console.log('imported module: ' + typeof sqlite3);
	const db = new sqlite3.Database(`${path}/resource.sqlite`);
	console.log('created db: ' + typeof db);
	await db.run('DROP TABLE resources_fts');
	await db.run('CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(id, title, text)');
	return db;
}

async function indexResources(api: JoplinData, resourceDir: string, db: any) {
	const resources: any[] = (await api.get(['resources'], { fields: ['id', 'title', 'mime']})).items;
	resources.forEach(r => indexResource(r, resourceDir, db));
}

async function indexResource(resource: any, resourceDir: string, db: any) {
	console.log(`index ${JSON.stringify(resource)}`);
	if (resource.mime === 'application/pdf') {
		const fs = joplin.plugins.require('fs-extra'); // TODO import once
		// const pdf = require('pdf-parse');
		// const buffer = fs.readFileSync(`${resourceDir}/${resource.id}.pdf`);
		// const data = await pdf(buffer);
		// console.log(`parsed pdf: ${JSON.stringify(data)}`);

		const text = await extractText(`${resourceDir}/${resource.id}.pdf`);
		console.log(`extracted text from ${resource.title}: ${text.substring(0, 100)}`);

		await db.run('INSERT INTO resources_fts VALUES(?, ?, ?)', resource.id, resource.title, text);
	}
}

joplin.plugins.register({
	onStart: async function() {
		console.info('Plugin started!');
		const profileDir = await joplin.settings.globalValue('profileDir');
		const resourceDir = await joplin.settings.globalValue('resourceDir');
		console.log(`the profile is in ${profileDir}`);

		const db = await initDb(profileDir);

		await indexResources(joplin.data, resourceDir, db);
	},
});
