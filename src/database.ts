import { Database, sqlite3 } from 'sqlite3';

const SCHEMA_VERSION = 1;

function query(db: Database, query, ...params): Promise<any[]> {
	return new Promise((resolve, reject) => {
		db.all(query, params, (err, rows) => {
			if (!!err) {
				reject(err);
			} else {
				resolve(rows);
			}
		});
	});
}

function run(db: Database, query, ...params) {
    return new Promise(function(resolve, reject) {
        db.run(query, params, function(err)  {
            if(err) {
                reject(err.message);
            } else {
                resolve(true);
            }
        });
    });
}

async function initDb(path: string, sqlite3: sqlite3): Promise<Database> {
	const db: Database = new sqlite3.Database(`${path}/resources.sqlite`);
    await run(db, 'CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT)');
	const version = await query(db, 'SELECT value FROM settings WHERE name = ?', 'version');
    const ver = !!version ? version[0] : -1;
	if (ver !== SCHEMA_VERSION) {
        // rebuild index
        await run(db, 'DROP TABLE IF EXISTS resources_fts');
		await run(db, 'CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(id, title, text)');

        // create or clean index_time
        await run(db, 'CREATE TABLE IF NOT EXISTS index_time (id TEXT PRIMARY KEY, index_time INTEGER)');
        await run(db, 'DELETE FROM index_time');

        await run(db, 'VACUUM');

        await run(db, `INSERT INTO settings VALUES('version', ${SCHEMA_VERSION}) ON CONFLICT(name) DO UPDATE SET value=${SCHEMA_VERSION}`);
	}
	return db;
}

function addToIndex(db: Database, title, id, text) {
	db.run('INSERT INTO resources_fts VALUES(?, ?, ?)', id, title, text);
	db.run('INSERT INTO index_time VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET index_time = ?', id, Date.now() / 1000, Date.now() / 1000);
}

export { initDb, run, query, addToIndex };