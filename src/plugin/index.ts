import joplin from 'api';
import JoplinData from 'api/JoplinData';
import { MenuItemLocation } from 'api/types';
import { pdfToText} from '../index/pdf';
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
async function transformResult(searchResult: any[]) {
	const res = [];
	console.log(`result: ${JSON.stringify(searchResult)}`);
	for (let i = 0; i < searchResult.length; i++) {
		const resource = searchResult[i];
		// TODO collect promises and await all
		const notes = (await joplin.data.get(['resources', resource.id, 'notes'], { fields: ['id', 'title']})).items;
		const note = !!notes && notes.length > 0 ? notes[0] : {}; // TODO what if more than 1 note?
		res.push({
			id: resource.id,
			title: resource.title,
			noteTitle: note.title,
			noteId: note.id
		});
	}
	return res;
}

joplin.plugins.register({
	onStart: async function() {
		try {
		const dbPath = await joplin.plugins.dataDir();
		const db = await initDb(dbPath, joplin.plugins.require('sqlite3'));

		const resourceDir = await joplin.settings.globalValue('resourceDir');
		await indexResources(joplin.data, resourceDir, db);

		const resourceSearch = await joplin.views.dialogs.create('resourceSearch');
		joplin.views.dialogs.setButtons(resourceSearch, []);
		joplin.views.dialogs.addScript(resourceSearch, './resource-search-view.js')
		joplin.views.dialogs.addScript(resourceSearch, './resource-search-view.css')

		joplin.views.dialogs.setHtml(resourceSearch, `
		<div id="resource-search" style="display: flex; flex-direction: column; min-width: 400px; resize: both;">
			<input id="query-input" type="text" autofocus/><br/>
			<div id="search-results"></div>
		</div>
		`);

		joplin.views.panels.onMessage(resourceSearch, async msg => {
			console.log(`on message: ${JSON.stringify(msg)}`);
			if (msg.type === 'search') {
				const result: any[] = await query(db, 'SELECT id,title FROM resources_fts WHERE text MATCH ?', msg.query);
				console.log(`results: ${JSON.stringify(result)}`);
				return await transformResult(result);
			} else if (msg.type === 'goToNote') {
				joplin.commands.execute('openNote', msg.noteId);
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
	} catch (e) { console.error(e)}
	},
});
