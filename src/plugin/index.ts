import joplin from 'api';
import JoplinData from 'api/JoplinData';
import { MenuItemLocation } from 'api/types';
import { pdfToText} from '../index/pdf';
import { addToIndex, initDb, query } from './database';
import { Database } from 'sqlite3';
import { Message, SearchResult, NoteRef } from '../common';

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
	if (lastIndexed	 > resource.updated_time) {
		console.log(`Skip indexing ${resource.id}/${resource.title}`);
		return;
	}
	if (resource.mime === 'application/pdf') {
		const text = await pdfToText(`${resourceDir}/${resource.id}.pdf`);
		console.log(`extracted text from ${resource.title}: ${text.substring(0, 100)}`);
		addToIndex(db, resource.title, resource.id, text);
	}
}
async function transformResult(searchResult: any[]): Promise<SearchResult[]> {
	const res: SearchResult[] = [];
	console.log(`result: ${JSON.stringify(searchResult)}`);
	for (let i = 0; i < searchResult.length; i++) {
		const resource = searchResult[i];
		// TODO collect promises and await all
		const notes: NoteRef[] = (await joplin.data.get(['resources', resource.id, 'notes'], { fields: ['id', 'title']})).items;
		res.push({
			id: resource.id,
			title: resource.title,
			notes: notes,
		});
	}
	return res;
}

joplin.plugins.register({
	onStart: async function() {
		const dbPath = await joplin.plugins.dataDir();
		const db = await initDb(dbPath, joplin.plugins.require('sqlite3'));

		const resourceDir = await joplin.settings.globalValue('resourceDir');
		await indexResources(joplin.data, resourceDir, db);

		const resourceSearch = await joplin.views.dialogs.create('resourceSearch');
		joplin.views.dialogs.setButtons(resourceSearch, []);
		joplin.views.dialogs.addScript(resourceSearch, './resource-search-view.js')
		joplin.views.dialogs.addScript(resourceSearch, './resource-search-view.css')

		joplin.views.dialogs.setHtml(resourceSearch, `
		<div id="resource-search">
			<input id="query-input" type="text" autofocus>
			<ul id="search-results"></ul>
		</div>
		`);

		joplin.views.panels.onMessage(resourceSearch, async (msg: Message) => {
			console.log(`on message: ${JSON.stringify(msg)}`);
			switch (msg.type) {
				case 'search':
					const result: any[] = await query(db, 'SELECT id,title FROM resources_fts WHERE text MATCH ?', msg.query);
					console.log(`results: ${JSON.stringify(result)}`);
					return await transformResult(result);
				case 'goto':
					// TODO scroll to the resource position within the note
					await joplin.views.panels.hide(resourceSearch);
					await joplin.commands.execute('openNote', msg.noteId);
					break;
			}
		});

		await joplin.commands.register({
			name: 'searchAttachments',
			label: 'Search in attachments',
			execute: async () => {
				await joplin.views.dialogs.open(resourceSearch);
			},
		})
		await joplin.views.menuItems.create('Search in attachments', 'searchAttachments', MenuItemLocation.Edit);
	},
});
