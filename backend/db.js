const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados SQLite:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        db.run('PRAGMA journal_mode=WAL');
        db.run('PRAGMA busy_timeout=5000');
    }
});

module.exports = db;
