import joplin from 'api';
import JoplinData from 'api/JoplinData';
import { MenuItemLocation, ViewHandle } from 'api/types';
import Joplin from 'api/Joplin';

import * as pdfjs  from 'pdfjs-dist/es5/build/pdf.js';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import JoplinViewsMenuItems from 'api/JoplinViewsMenuItems';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

async function pdfToText(path) {
	const pdf = await pdfjs.getDocument(path).promise;
	let complete = 0;
	let total = pdf.numPages;
	let pages = {};
	for (let pagei = 1; pagei <= total; pagei++) {
		const page = await pdf.getPage(pagei);
		let pageNumber = page.pageNumber;
		const textContent = await page.getTextContent();
		if (null != textContent.items) {
			let page_text = "";
			let last_item = null;
			for (let itemsi = 0; itemsi < textContent.items.length; itemsi++) {
				let item = textContent.items[itemsi];
				if (last_item != null && last_item.str[last_item.str.length - 1] != ' ') {
					let itemX = item.transform[5]
					let lastItemX = last_item.transform[5]
					let itemY = item.transform[4]
					let lastItemY = last_item.transform[4]
					if (itemX < lastItemX)
						page_text += "\r\n";
					else if (itemY != lastItemY && (last_item.str.match(/^(\s?[a-zA-Z])$|^(.+\s[a-zA-Z])$/) == null))
						page_text += ' ';
				}

				page_text += item.str;
				last_item = item;
			}
			pages[pageNumber] = page_text + "\n\n";
		}
		++complete;
		if (complete == total) {
			let full_text = "";
			let num_pages = Object.keys(pages).length;
			for (let pageNum = 1; pageNum <= num_pages; pageNum++)
				full_text += pages[pageNum];
			return full_text;
		}
	}
	return '';
}

async function initDb(path: string) {
	const sqlite3 = joplin.plugins.require('sqlite3');
	await (require('fs-extra').remove(`${path}/resource.sqlite`));
	const db = new sqlite3.Database(`${path}/resource.sqlite`);
	await db.run('CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(id, title, text)');
	return db;
}

async function indexResources(api: JoplinData, resourceDir: string, db: any) {
	let page = 0;
	let response = await api.get(['resources'], { page: page, fields: ['id', 'title', 'mime']});
	console.log(`response: ${JSON.stringify(response)}`);
	response.items.forEach(r => indexResource(r, resourceDir, db));
	while (!!response.has_more) {
		page += 1;
		response = await api.get(['resources'], { page: page, fields: ['id', 'title', 'mime']});
		console.log(`response: ${JSON.stringify(response)}`);
		response.items.forEach(r => indexResource(r, resourceDir, db));
	}
}

async function indexResource(resource: any, resourceDir: string, db: any) {
	console.log(`index ${JSON.stringify(resource)}`);
	if (resource.mime === 'application/pdf') {
		const fs = joplin.plugins.require('fs-extra'); // TODO import once

		const text = await pdfToText(`${resourceDir}/${resource.id}.pdf`);
		console.log(`extracted text from ${resource.title}: ${text.substring(0, 100)}`);

		await db.run('INSERT INTO resources_fts VALUES(?, ?, ?)', resource.id, resource.title, text);
	}
}

async function onSearchResult(joplin: Joplin, dialog: ViewHandle, searchResult: any[]) {
	console.log(`result: ${JSON.stringify(searchResult)}`);

	let html = `<div><table style="table-layout: auto;"><thead><tr><th>Title</th><th>Included in note(s)</th></thead><tbody>
	</div>`;
	for (let i = 0; i < searchResult.length; i++) {
		const result = searchResult[i];
		const notes = (await joplin.data.get(['resources', result.id, 'notes'], { fields: ['id', 'title']})).items;
		const noteTitle = !!notes && notes.length > 0 ? notes[0].title : '';
		html += `
		<tr>
			<td>${result.title}</td>
			<td>
				<a href="#" onclick="" >${noteTitle}</a>
			</td>
		</tr>`;
	}
	html += '</tbody></table>'
	await joplin.views.dialogs.setHtml(dialog, html);
	await joplin.views.dialogs.open(dialog);
}

joplin.plugins.register({
	onStart: async function() {
		console.info('Plugin started!');
		const profileDir = await joplin.plugins.dataDir();
		const db = await initDb(profileDir);

		const resourceDir = await joplin.settings.globalValue('resourceDir');
		await indexResources(joplin.data, resourceDir, db);

		const searchDialogHandle = await joplin.views.dialogs.create('searchDialog');
		await joplin.views.dialogs.setHtml(searchDialogHandle, `
		<form name="form">
			Query: <input name="query" type="text" required autofocus>
		</form>
		`);

		const searchResultsDialogHandle = await joplin.views.dialogs.create('resultsDialog');

		await joplin.commands.register({
			name: 'searchAttachments',
			label: 'Search in attachments',
			execute: async () => {
				const result = await joplin.views.dialogs.open(searchDialogHandle);

				if (result.id === 'ok') {
					const query = result.formData.form.query;
					db.all('SELECT id,title FROM resources_fts WHERE text MATCH ?', query, async (_err, searchResult) =>
						onSearchResult(joplin, searchResultsDialogHandle, searchResult)
					);
				}
			},
		})
		await joplin.views.menuItems.create('Search in attachments', 'searchAttachments', MenuItemLocation.Edit);
	},
});
