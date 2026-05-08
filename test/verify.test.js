const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

function runScript(db, script) {
  const sql = fs.readFileSync(script, 'utf8');
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function tableExistsInDatabase(db, tableName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(!!row);
      }
    });
  });
}

function getColumns(db, tableName) {
  return new Promise((resolve, reject) => {
    const sql = `PRAGMA table_info(${tableName});`;
    db.all(sql, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function checkUniqueConstraint(db, tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA index_list(${tableName});`, (err, indexes) => {
      if (err) {
        reject(err);
        return;
      }
      const uniqueIndexesPromises = indexes.filter(index => index.unique).map(index => new Promise((resolveIndex, rejectIndex) => {
        db.all(`PRAGMA index_info(${index.name});`, (err, columns) => {
          if (err) {
            rejectIndex(err);
            return;
          }
          resolveIndex(columns.some(col => col.name === columnName));
        });
      }));
      Promise.all(uniqueIndexesPromises).then(results => {
        resolve(results.includes(true));
      }).catch(reject);
    });
  });
}

describe('the SQL in the `exercise.sql` file', () => {
  let db;
  let cleanup;
  let scriptPath;

  beforeAll(async () => {
    const dbPath = path.resolve(__dirname, '..', 'lesson24.db');
    scriptPath = path.resolve(__dirname, '..', 'exercise.sql');
    cleanup = path.resolve(__dirname, './cleanup.sql');
    db = new sqlite3.Database(dbPath);
    await runScript(db, cleanup);
  });

  afterAll(async () => {
    await runScript(db, cleanup);
    db.close();
  });

  test('Should have a table named Products with specified columns, a unique SERIAL_NUMBER, and NOT NULL constraints on PRODUCT_NAME and PRICE', async () => {
    await runScript(db, scriptPath);
    const tableName = "Products";
    const tableExists = await tableExistsInDatabase(db, tableName);
    expect(tableExists).toBe(true);

    const columnInfo = await getColumns(db, tableName);
    const expectedColumnNames = ['ID', 'PRODUCT_NAME', 'SERIAL_NUMBER', 'CATEGORY', 'PRICE'];
    const existingColumnNames = columnInfo.map(row => row.name);
    expect(expectedColumnNames.sort()).toStrictEqual(existingColumnNames.sort());

    const hasUniqueSerialNumber = await checkUniqueConstraint(db, tableName, 'SERIAL_NUMBER');
    expect(hasUniqueSerialNumber).toBe(true);

    const notNullColumns = columnInfo.filter(col => col.notnull === 1).map(col => col.name);
    expect(notNullColumns).toContain('PRODUCT_NAME');
    expect(notNullColumns).toContain('PRICE');
  });
});
