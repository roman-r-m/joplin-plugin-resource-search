import joplin from 'api';
import JoplinData from 'api/JoplinData';
import { MenuItemLocation, ViewHandle } from 'api/types';
import Joplin from 'api/Joplin';
import { pdfToText} from './index/pdf';
import { addToIndex, initDb, query } from './database';
import { Database } from 'sqlite3';

async function indexResources(api: JoplinData, resourceDir: string, db: Database) {
	let page = 0;
	let response = await api.get(['resources'], { page: page, fields: ['id', 'title', 'mime', 'updated_time']});
	console.log(`response: ${JSON.stringify(response)}`);
	response.items.forEach(r => indexResource(r, resourceDir, db));
	while (!!response.has_more) {
		page += 1;
		response = await api.get(['resources'], { page: page, fields: ['id', 'title', 'mime', 'updated_time']});
		console.log(`response: ${JSON.stringify(response)}`);
		response.items.forEach(r => indexResource(r, resourceDir, db));
	}
}

async function indexResource(resource: any, resourceDir: string, db: Database) {
	console.log(`index ${JSON.stringify(resource)}`);
	const lastIndexed = await query(db, 'SELECT index_time FROM index_time WHERE id = ?', resource.id);
	console.log(`indexed=${lastIndexed}, updated=${resource.updated_time}`);
	if (lastIndexed > resource.updated_time) {
		console.log(`Skip indexing ${resource.id}/${resource.title}`);
		return;
	}
	if (resource.mime === 'application/pdf') {
		const text = await pdfToText(`${resourceDir}/${resource.id}.pdf`);
		console.log(`extracted text from ${resource.title}: ${text.substring(0, 100)}`);
		addToIndex(db, resource.title, resource.id, text);
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
		try {
		const dbPath = await joplin.plugins.dataDir();
		const db = await initDb(dbPath, joplin.plugins.require('sqlite3'));

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
	} catch (e) { console.error(e)}
	},
});
