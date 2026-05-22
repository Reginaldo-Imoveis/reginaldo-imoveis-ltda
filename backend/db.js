const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Em produção (Railway), aponta para o Volume montado via DATABASE_PATH
const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        process.stderr.write(`Erro ao abrir SQLite: ${err.message}\n`);
        process.exit(1);
    }
    db.run('PRAGMA journal_mode=WAL');
    db.run('PRAGMA busy_timeout=5000');
});

module.exports = db;
