const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 7;

function runBackup(logger) {
    const db = require('./db');

    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const dest = path.join(BACKUP_DIR, `database-${date}.sqlite`);

    db.run(`VACUUM INTO ?`, [dest], (err) => {
        if (err) {
            if (logger) logger.error(`Backup falhou: ${err.message}`);
            else console.error(`Backup falhou: ${err.message}`);
            return;
        }
        if (logger) logger.info(`Backup criado: ${dest}`);
        else console.log(`Backup criado: ${dest}`);
        pruneOldBackups(logger);
    });
}

function pruneOldBackups(logger) {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('database-') && f.endsWith('.sqlite'))
            .sort();

        while (files.length > MAX_BACKUPS) {
            const oldest = path.join(BACKUP_DIR, files.shift());
            fs.unlinkSync(oldest);
            if (logger) logger.info(`Backup antigo removido: ${oldest}`);
        }
    } catch (e) {
        if (logger) logger.warn(`Erro ao limpar backups antigos: ${e.message}`);
    }
}

module.exports = { runBackup };
