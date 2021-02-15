import joplin from 'api';
import { MenuItemLocation } from 'api/types';
import { Message, SearchResult, NoteRef } from '../common';
import { Resource, ResourceIndex } from './ResourceIndex';
import { Database, sqlite3 } from 'sqlite3';


async function transformResult(searchResult: Resource[]): Promise<SearchResult[]> {
	const res: SearchResult[] = [];
	console.log(`result: ${JSON.stringify(searchResult)}`);
	for (let i = 0; i < searchResult.length; i++) {
		const resource = searchResult[i];
		// TODO collect promises and await all
		const notes: NoteRef[] = (await joplin.data.get(['resources', resource.id, 'notes'], { fields: ['id', 'title']})).items;
		notes.forEach(n => res.push({
			id: resource.id,
			title: resource.title,
			note: n
		}));
	}
	return res;
}

joplin.plugins.register({
	onStart: async function() {
		const resourceDir = await joplin.settings.globalValue('resourceDir');

		const dbPath = await joplin.plugins.dataDir();
		const sqlite3: sqlite3 = joplin.plugins.require('sqlite3');
		const db: Database = new sqlite3.Database(`${dbPath}/resources.sqlite`);

		const data = joplin.data;
		const index: ResourceIndex = await ResourceIndex.init(db, data, resourceDir);

		index.update();

		// TODO get interval from settings
		const indexRefreshInterval = 60 * 1000; // TODO reivew
		setInterval(() => index.update(), indexRefreshInterval);

		await joplin.commands.register({
			name: 'indexResources',
			label: 'Index Now',
			execute: () => index.update(),
		});
		await joplin.commands.register({
			name: 'rebuildIndex',
			label: 'Wipe and Rebuild Index',
			execute: () => index.rebuild(),
		});
		await joplin.views.menus.create('resourceSearchTools', 'Resource Search', [
			{label: 'Index Now', commandName: 'indexResources' },
			{label: 'Wipe and Rebuild Index', commandName: 'rebuildIndex' },
		], MenuItemLocation.Tools);

		const resourceSearch = await joplin.views.dialogs.create('resourceSearchDialog');

		// joplin.views.dialogs.setButtons(resourceSearch, []); TODO uncomment when there's a way to close dialog
		joplin.views.dialogs.setButtons(resourceSearch, [ { id: 'ok' }]);

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
					const result: any[] = await index.query(msg.query);
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
			label: 'Search in Attachments',
			execute: async () => {
				await joplin.views.dialogs.open(resourceSearch);
			},
		});
		await joplin.views.menuItems.create('Search in attachments', 'searchAttachments', MenuItemLocation.Edit);
	},
});
