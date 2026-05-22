const express = require('express');
const { param, query } = require('express-validator');
const fs = require('fs');

const db = require('../db');
const logger = require('../lib/logger');
const { cacheGet, cacheSet, cacheInvalidate } = require('../lib/cache');
const { stripHtml, generateSlug, handleValidation } = require('../lib/helpers');
const { uploadFields, validateMagicBytes, generateWebpVariants } = require('../lib/upload');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/imoveis ──────────────────────────────────────────
router.get('/', [
    query('tipo').optional().isString().trim(),
    query('busca').optional().isString().trim(),
    query('finalidade').optional().isIn(['Venda', 'Locação', 'todos']),
    query('preco_min').optional().isFloat({ min: 0 }),
    query('preco_max').optional().isFloat({ min: 0 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 })
], (req, res) => {
    if (handleValidation(req, res)) return;

    const cacheKey = 'imoveis:' + JSON.stringify(req.query);
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const { tipo, busca, finalidade, preco_min, preco_max } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let sql = 'SELECT * FROM imoveis WHERE 1=1';
    let countSql = 'SELECT COUNT(*) as total FROM imoveis WHERE 1=1';
    const params = [];
    const countParams = [];

    if (tipo && tipo !== 'todos') {
        sql += ' AND tipo = ?'; countSql += ' AND tipo = ?';
        params.push(tipo); countParams.push(tipo);
    }
    if (finalidade && finalidade !== 'todos') {
        sql += ' AND finalidade = ?'; countSql += ' AND finalidade = ?';
        params.push(finalidade); countParams.push(finalidade);
    }
    if (preco_min) {
        sql += ' AND preco >= ?'; countSql += ' AND preco >= ?';
        params.push(parseFloat(preco_min)); countParams.push(parseFloat(preco_min));
    }
    if (preco_max) {
        sql += ' AND preco <= ?'; countSql += ' AND preco <= ?';
        params.push(parseFloat(preco_max)); countParams.push(parseFloat(preco_max));
    }
    if (busca) {
        const term = '%' + stripHtml(busca) + '%';
        sql += ' AND (titulo LIKE ? OR descricao LIKE ?)';
        countSql += ' AND (titulo LIKE ? OR descricao LIKE ?)';
        params.push(term, term); countParams.push(term, term);
    }

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    db.get(countSql, countParams, (err, countRow) => {
        if (err) { logger.error(`DB erro imoveis count: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }

        db.all(sql, params, (err2, rows) => {
            if (err2) { logger.error(`DB erro imoveis: ${err2.message}`); return res.status(500).json({ error: 'Erro interno' }); }

            const total = countRow?.total || 0;
            const result = { data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
            cacheSet(cacheKey, result);
            res.json(result);
        });
    });
});

// ── GET /api/imoveis/:id ──────────────────────────────────────
router.get('/:id', [
    param('id').isInt({ min: 1 }).withMessage('ID inválido')
], (req, res) => {
    if (handleValidation(req, res)) return;

    db.get('SELECT * FROM imoveis WHERE id = ?', [req.params.id], (err, row) => {
        if (err) { logger.error(`DB erro imovel ${req.params.id}: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }
        if (!row) return res.status(404).json({ error: 'Imóvel não encontrado' });
        res.json(row);
    });
});

// ── POST /api/imoveis ─────────────────────────────────────────
router.post('/', authMiddleware, uploadFields, (req, res) => {
    const allFiles = [...(req.files?.imagem || []), ...(req.files?.galeria || [])];

    for (const f of allFiles) {
        if (!validateMagicBytes(f.path, f.mimetype)) {
            logger.warn(`UPLOAD REJEITADO: magic bytes inválidos — ${f.originalname} — IP: ${req.ip}`);
            fs.unlinkSync(f.path);
            return res.status(400).json({ error: 'Arquivo inválido — conteúdo não corresponde ao tipo declarado.' });
        }
    }
    allFiles.forEach(f => generateWebpVariants(f.path).catch(() => {}));

    const { titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, status, finalidade, mapa_url, bairro } = req.body;

    if (!titulo || !tipo) {
        return res.status(400).json({ error: 'Título e tipo são obrigatórios' });
    }

    const imagemUrl = req.files?.imagem?.[0] ? '/uploads/' + req.files.imagem[0].filename : '';
    const galeriaUrls = (req.files?.galeria || []).map(f => '/uploads/' + f.filename);
    const slug = generateSlug(titulo);

    const sql = 'INSERT INTO imoveis (titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, imagem, galeria, mapa_url, status, finalidade, slug, bairro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const params = [
        stripHtml(titulo), stripHtml(tipo), parseFloat(preco) || 0, stripHtml(descricao || ''),
        parseInt(quartos) || 0, parseInt(vagas) || 0, parseInt(suites) || 0,
        parseFloat(areaUtil) || 0, parseFloat(areaTotal) || 0,
        imagemUrl, JSON.stringify(galeriaUrls), stripHtml(mapa_url || ''),
        status || 'Disponível', finalidade || 'Venda', slug, stripHtml(bairro || '')
    ];

    db.run(sql, params, function(err) {
        if (err) { logger.error(`DB erro criar imovel: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }
        cacheInvalidate('imoveis');
        cacheInvalidate('sitemap');
        logger.info(`IMÓVEL CRIADO: #${this.lastID} "${stripHtml(titulo)}" — admin`);
        res.status(201).json({ success: true, id: this.lastID });
    });
});

// ── PUT /api/imoveis/:id ──────────────────────────────────────
router.put('/:id', authMiddleware, uploadFields, [
    param('id').isInt({ min: 1 }).withMessage('ID inválido')
], (req, res) => {
    if (handleValidation(req, res)) return;

    const allFiles = [...(req.files?.imagem || []), ...(req.files?.galeria || [])];

    for (const f of allFiles) {
        if (!validateMagicBytes(f.path, f.mimetype)) {
            logger.warn(`UPLOAD REJEITADO: magic bytes inválidos — ${f.originalname} — IP: ${req.ip}`);
            fs.unlinkSync(f.path);
            return res.status(400).json({ error: 'Arquivo inválido — conteúdo não corresponde ao tipo declarado.' });
        }
    }
    allFiles.forEach(f => generateWebpVariants(f.path).catch(() => {}));

    const { id } = req.params;
    const { titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, status, finalidade, mapa_url, bairro } = req.body;

    db.get('SELECT imagem, galeria FROM imoveis WHERE id = ?', [id], (err, row) => {
        if (err) { logger.error(`DB erro buscar imovel ${id}: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }
        if (!row) return res.status(404).json({ error: 'Imóvel não encontrado' });

        const imagemUrl = req.files?.imagem?.[0] ? '/uploads/' + req.files.imagem[0].filename : row.imagem;

        let galeriaUrls;
        if (req.files?.galeria?.length) {
            const novas = req.files.galeria.map(f => '/uploads/' + f.filename);
            const existentes = JSON.parse(row.galeria || '[]');
            galeriaUrls = [...existentes, ...novas];
        } else {
            galeriaUrls = JSON.parse(row.galeria || '[]');
        }

        const slug = generateSlug(titulo);
        const sql = 'UPDATE imoveis SET titulo=?, tipo=?, preco=?, descricao=?, quartos=?, vagas=?, suites=?, areaUtil=?, areaTotal=?, imagem=?, galeria=?, mapa_url=?, status=?, finalidade=?, slug=?, bairro=? WHERE id=?';
        const params = [
            stripHtml(titulo), stripHtml(tipo), parseFloat(preco) || 0, stripHtml(descricao || ''),
            parseInt(quartos) || 0, parseInt(vagas) || 0, parseInt(suites) || 0,
            parseFloat(areaUtil) || 0, parseFloat(areaTotal) || 0,
            imagemUrl, JSON.stringify(galeriaUrls), stripHtml(mapa_url || ''),
            status || 'Disponível', finalidade || 'Venda', slug, stripHtml(bairro || ''), id
        ];

        db.run(sql, params, function(err2) {
            if (err2) { logger.error(`DB erro atualizar imovel ${id}: ${err2.message}`); return res.status(500).json({ error: 'Erro interno' }); }
            cacheInvalidate('imoveis');
            cacheInvalidate('sitemap');
            logger.info(`IMÓVEL ATUALIZADO: #${id} — admin`);
            res.json({ success: true, id: parseInt(id) });
        });
    });
});

// ── DELETE /api/imoveis/:id ───────────────────────────────────
router.delete('/:id', authMiddleware, [
    param('id').isInt({ min: 1 }).withMessage('ID inválido')
], (req, res) => {
    if (handleValidation(req, res)) return;

    const { id } = req.params;

    db.run('DELETE FROM imoveis WHERE id = ?', [id], function(err) {
        if (err) { logger.error(`DB erro deletar imovel ${id}: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'Imóvel não encontrado' });
        cacheInvalidate('imoveis');
        cacheInvalidate('sitemap');
        logger.info(`IMÓVEL DELETADO: #${id} — admin`);
        res.json({ success: true });
    });
});

module.exports = router;
