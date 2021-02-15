import JoplinData from "api/JoplinData";
import { Database } from "sqlite3";
import { pdfToText } from "../index/pdf";
import { query, run } from "./DbUtils";

const SCHEMA_VERSION = 1;

// resource descriptor as returned by Joplin's data API
type JoplinResource = {
    id: string,
    title: string,
    mime: string,
    updated_time: number
};

type Resource = {
    id: string,
    title: string
}

class ResourceIndex {

    private db: Database;
    private data: JoplinData;
    private resourceDir: string;

    public static async init(db: Database, data: JoplinData, resourceDir: string): Promise<ResourceIndex> {
        // init the database
        await run(db, 'CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT)');
        const versionResult = await query(db, 'SELECT value FROM settings WHERE name = ?', 'version');
        const version = !!versionResult && versionResult.length > 0 ? Number(versionResult[0].value) : -1;
        console.log(`plugin schema version: ${SCHEMA_VERSION}, db schema version: ${version}`);

        if (version !== SCHEMA_VERSION) {
            console.log('Schema version mismatch - rebuilding the database');
            await initDatabase(db);
        }
        return new ResourceIndex(db, data, resourceDir);
    }

    constructor(db: Database, data: JoplinData, resourceDir: string) {
        this.db = db;
        this.data = data;
        this.resourceDir = resourceDir;
    }

    public async update() {
        console.log('Updating index');
        let page = 1;
        let response = await this.data.get(['resources'], { page: page, fields: ['id', 'title', 'mime', 'updated_time']});
        response.items.forEach(async (r: JoplinResource) => await this.indexResource(r));
        while (!!response.has_more) {
            page += 1;
            response = await this.data.get(['resources'], { page: page, fields: ['id', 'title', 'mime', 'updated_time']});
            response.items.forEach(async (r: JoplinResource) => await this.indexResource(r));
        }
    }

    private async indexResource(resource: JoplinResource) {
        try {
            console.log(`Indexing ${JSON.stringify(resource)}`);

            const lastIndexed = await this.getLastIndexTime(resource.id);
            if (!!lastIndexed && lastIndexed > resource.updated_time) {
                console.log(`Skip indexing ${resource.id}/${resource.title}`);
                return;
            }

            const isSupportedType = resource.mime === 'application/pdf';
            if (isSupportedType) {
                const text = await pdfToText(`${this.resourceDir}/${resource.id}.pdf`);
                console.log(`extracted text from ${resource.id}/${resource.title}: ${text.substring(0, 100)}`);
                await run(this.db, 'INSERT INTO resources_fts VALUES(?, ?, ?)', resource.id, resource.title, text);
            } else {
                console.log(`Skip indexing ${resource.id} - MIME type not supported`);
            }

            await this.updateLastIndexTime(resource.id);
        } catch (e) {
            console.log(`error indexing ${JSON.stringify(resource)}: ${e}`);
        }
    }

    private async updateLastIndexTime(id: string) {
        await run(this.db, 'INSERT INTO index_time VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET index_time = ?',
            id, Date.now(), Date.now());
    }

    private async getLastIndexTime(id: string): Promise<number> {
        const result = await query(this.db, 'SELECT index_time FROM index_time WHERE id = ?', id);
		return !!result && Array.isArray(result) && result.length > 0 ? Number(result[0].index_time) : 0;
    }

    public async rebuild() {
        console.log('Rebuilding the database');

        await initDatabase(this.db);
        await this.update();
    }

    public async query(text: string): Promise<Resource[]> {
        return await query(this.db, 'SELECT id, title FROM resources_fts WHERE text MATCH ?', text) as Resource[];
    }
}

async function initDatabase(db: Database) {
    // rebuild index
    await run(db, 'DROP TABLE IF EXISTS resources_fts');
    await run(db, 'CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(id, title, text)');

    // create or clean index_time
    await run(db, 'CREATE TABLE IF NOT EXISTS index_time (id TEXT PRIMARY KEY, index_time INTEGER)');
    await run(db, 'DELETE FROM index_time');

    await run(db, 'VACUUM');
    await run(db, `INSERT INTO settings VALUES('version', ${SCHEMA_VERSION}) ON CONFLICT(name) DO UPDATE SET value=${SCHEMA_VERSION}`);
}

export { Resource, ResourceIndex };