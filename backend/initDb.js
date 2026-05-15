const db = require('./db');

const initDatabase = () => {
    db.serialize(() => {
        // Criar tabela de imóveis
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
            if (err) console.error('Erro ao criar tabela imoveis:', err.message);
            else console.log('Tabela imoveis criada ou já existente.');
        });

        // Adicionar coluna finalidade se não existir (migração)
        db.run(`ALTER TABLE imoveis ADD COLUMN finalidade TEXT DEFAULT 'Venda'`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Erro ao adicionar coluna finalidade:', err.message);
            }
        });

        // Migração: galeria de imagens (JSON array de paths)
        db.run(`ALTER TABLE imoveis ADD COLUMN galeria TEXT DEFAULT '[]'`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Erro ao adicionar coluna galeria:', err.message);
            }
        });

        // Migração: URL do Google Maps
        db.run(`ALTER TABLE imoveis ADD COLUMN mapa_url TEXT DEFAULT ''`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Erro ao adicionar coluna mapa_url:', err.message);
            }
        });

        // Migração: slug amigável para SEO
        db.run(`ALTER TABLE imoveis ADD COLUMN slug TEXT DEFAULT ''`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Erro ao adicionar coluna slug:', err.message);
            }
        });

        // Criar tabela de leads
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
        `, (err) => {
            if (err) console.error('Erro ao criar tabela leads_imobiliaria:', err.message);
            else console.log('Tabela leads_imobiliaria criada ou já existente.');
        });

        // Criar tabela de tracking comportamental
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
        `, (err) => {
            if (err) console.error('Erro ao criar tabela leads_tracking:', err.message);
            else console.log('Tabela leads_tracking criada ou já existente.');
        });

        // Migração: origem e UTM no lead
        db.run(`ALTER TABLE leads_imobiliaria ADD COLUMN origem TEXT DEFAULT ''`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Erro ao adicionar coluna origem:', err.message);
            }
        });
        db.run(`ALTER TABLE leads_imobiliaria ADD COLUMN utm_source TEXT DEFAULT ''`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Erro ao adicionar coluna utm_source:', err.message);
            }
        });
        db.run(`ALTER TABLE leads_imobiliaria ADD COLUMN session_id TEXT DEFAULT ''`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Erro ao adicionar coluna session_id:', err.message);
            }
        });

        // Inserir dados iniciais (seed) extraídos do site
        const checkQuery = `SELECT count(*) as count FROM imoveis`;
        db.get(checkQuery, (err, row) => {
            if (err) {
                console.error(err);
                return;
            }
            if (row.count === 0) {
                console.log('Populando banco com dados iniciais...');
                const imoveis = [
                    ['Comercial Vila Fátima', 'Comercial', 1350000.00, 'Amplo espaço comercial na Vila Fátima', 0, 1, 0, 400.0, 280.0, 'https://s3.amazonaws.com/static.nidoimovel.com.br/9cb67ffb59554ab1dabb65bcb370ddd9/imovel/RI/RI33/RI33022.jpg?1654113528', 1, 'Disponível'],
                    ['Apartamento Jardim Avelino', 'Apartamento', 1200000.00, 'Lindo apartamento de alto padrão', 4, 3, 2, 285.0, 285.0, 'https://s3.amazonaws.com/static.nidoimovel.com.br/9cb67ffb59554ab1dabb65bcb370ddd9/imovel/RI/RI44/RI44029.jpg?1655219465', 1, 'Disponível'],
                    ['Sobrado Chácara Mafalda', 'Sobrado', 1100000.00, 'Sobrado confortável e bem localizado', 4, 3, 1, 225.0, 300.0, 'https://s3.amazonaws.com/static.nidoimovel.com.br/9cb67ffb59554ab1dabb65bcb370ddd9/imovel/RI/RI25/RI25001.jpg?1653751433', 1, 'Vendido'],
                    ['Apartamento Mooca', 'Apartamento', 998000.00, 'Apartamento espaçoso na Mooca', 5, 2, 2, 300.0, 300.0, 'https://s3.amazonaws.com/static.nidoimovel.com.br/9cb67ffb59554ab1dabb65bcb370ddd9/imovel/RI/RI62/RI62006.jpg?1658842013', 0, 'Disponível']
                ];

                const stmt = db.prepare(`INSERT INTO imoveis (titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, imagem, destaque, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                imoveis.forEach(i => {
                    stmt.run(i);
                });
                stmt.finalize();
                console.log('Dados iniciais inseridos com sucesso!');
            } else {
                console.log('Banco já populado.');
            }
        });
    });
};

initDatabase();
