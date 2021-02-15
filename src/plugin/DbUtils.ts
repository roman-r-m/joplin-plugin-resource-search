import { Database } from "sqlite3";

async function query(db: Database, query, ...params): Promise<any[]> {
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

async function run(db: Database, query, ...params): Promise<boolean> {
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

export { query, run };