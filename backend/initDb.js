const db = require('./db');
const logger = require('./lib/logger');

function initDatabase() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS imoveis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                tipo TEXT NOT NULL,
                preco REAL NOT NULL,
                descricao TEXT,
                quartos INTEGER,
                vagas INTEGER,
                suites INTEGER,
                areaUtil REAL,
                areaTotal REAL,
                imagem TEXT,
                finalidade TEXT DEFAULT 'Venda',
                destaque BOOLEAN DEFAULT 0,
                status TEXT DEFAULT 'Disponível',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) logger.error(`Erro ao criar tabela imoveis: ${err.message}`);
        });

        // Migrations: add columns if they don't exist yet
        const migrations = [
            `ALTER TABLE imoveis ADD COLUMN finalidade TEXT DEFAULT 'Venda'`,
            `ALTER TABLE imoveis ADD COLUMN galeria TEXT DEFAULT '[]'`,
            `ALTER TABLE imoveis ADD COLUMN mapa_url TEXT DEFAULT ''`,
            `ALTER TABLE imoveis ADD COLUMN slug TEXT DEFAULT ''`,
            `ALTER TABLE imoveis ADD COLUMN bairro TEXT DEFAULT ''`,
            `ALTER TABLE leads_imobiliaria ADD COLUMN origem TEXT DEFAULT ''`,
            `ALTER TABLE leads_imobiliaria ADD COLUMN utm_source TEXT DEFAULT ''`,
            `ALTER TABLE leads_imobiliaria ADD COLUMN session_id TEXT DEFAULT ''`,
            `ALTER TABLE leads_imobiliaria ADD COLUMN email TEXT DEFAULT ''`,
            `ALTER TABLE leads_imobiliaria ADD COLUMN mensagem TEXT DEFAULT ''`,
        ];
        migrations.forEach(sql => {
            db.run(sql, (err) => {
                if (err && !err.message.includes('duplicate column') && !err.message.includes('no such table')) {
                    logger.error(`Migration failed: ${sql} — ${err.message}`);
                }
            });
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS leads_imobiliaria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                telefone TEXT NOT NULL,
                tipo_imovel TEXT,
                quartos TEXT,
                vagas TEXT,
                faixa_preco REAL,
                classificacao TEXT DEFAULT 'Normal',
                status TEXT DEFAULT 'novo',
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => { if (err) logger.error(`Erro ao criar tabela leads_imobiliaria: ${err.message}`); });

        db.run(`
            CREATE TABLE IF NOT EXISTS leads_tracking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                evento TEXT NOT NULL,
                dados TEXT,
                pagina TEXT,
                imovel_id INTEGER,
                origem TEXT,
                utm_source TEXT,
                utm_medium TEXT,
                utm_campaign TEXT,
                referrer TEXT,
                user_agent TEXT,
                ip TEXT,
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => { if (err) logger.error(`Erro ao criar tabela leads_tracking: ${err.message}`); });

        db.run(`
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `, (err) => { if (err) logger.error(`Erro ao criar tabela app_config: ${err.message}`); });

        db.run(`
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                token_hash TEXT PRIMARY KEY,
                expires_at INTEGER NOT NULL
            )
        `, (err) => { if (err) logger.error(`Erro ao criar tabela revoked_tokens: ${err.message}`); });

        // Indexes
        [
            `CREATE INDEX IF NOT EXISTS idx_imoveis_tipo ON imoveis(tipo)`,
            `CREATE INDEX IF NOT EXISTS idx_imoveis_finalidade ON imoveis(finalidade)`,
            `CREATE INDEX IF NOT EXISTS idx_imoveis_status ON imoveis(status)`,
            `CREATE INDEX IF NOT EXISTS idx_imoveis_preco ON imoveis(preco)`,
            `CREATE INDEX IF NOT EXISTS idx_imoveis_destaque ON imoveis(destaque)`,
            `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads_imobiliaria(status)`,
            `CREATE INDEX IF NOT EXISTS idx_tracking_session ON leads_tracking(session_id)`,
            `CREATE INDEX IF NOT EXISTS idx_revoked_expires ON revoked_tokens(expires_at)`,
        ].forEach(sql => db.run(sql));

        // Seed initial data only if table is empty
        db.get(`SELECT count(*) as count FROM imoveis`, (err, row) => {
            if (err || row.count > 0) return;

            logger.info('Populando banco com dados iniciais...');
            const stmt = db.prepare(
                `INSERT INTO imoveis (titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, imagem, destaque, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            [
                ['Comercial Vila Fátima', 'Comercial', 1350000, 'Amplo espaço comercial na Vila Fátima', 0, 1, 0, 400, 280, 'https://s3.amazonaws.com/static.nidoimovel.com.br/9cb67ffb59554ab1dabb65bcb370ddd9/imovel/RI/RI33/RI33022.jpg?1654113528', 1, 'Disponível'],
                ['Apartamento Jardim Avelino', 'Apartamento', 1200000, 'Lindo apartamento de alto padrão', 4, 3, 2, 285, 285, 'https://s3.amazonaws.com/static.nidoimovel.com.br/9cb67ffb59554ab1dabb65bcb370ddd9/imovel/RI/RI44/RI44029.jpg?1655219465', 1, 'Disponível'],
                ['Sobrado Chácara Mafalda', 'Sobrado', 1100000, 'Sobrado confortável e bem localizado', 4, 3, 1, 225, 300, 'https://s3.amazonaws.com/static.nidoimovel.com.br/9cb67ffb59554ab1dabb65bcb370ddd9/imovel/RI/RI25/RI25001.jpg?1653751433', 1, 'Vendido'],
                ['Apartamento Mooca', 'Apartamento', 998000, 'Apartamento espaçoso na Mooca', 5, 2, 2, 300, 300, 'https://s3.amazonaws.com/static.nidoimovel.com.br/9cb67ffb59554ab1dabb65bcb370ddd9/imovel/RI/RI62/RI62006.jpg?1658842013', 0, 'Disponível'],
            ].forEach(row => stmt.run(row));
            stmt.finalize(() => logger.info('Dados iniciais inseridos com sucesso.'));
        });
    });
}

initDatabase();
