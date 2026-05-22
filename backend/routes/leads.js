const express = require('express');
const { body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const logger = require('../lib/logger');
const { stripHtml, handleValidation } = require('../lib/helpers');
const { authMiddleware } = require('../middleware/auth');
const { HIGH_TICKET_THRESHOLD } = require('../config');

const router = express.Router();

const leadsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    validate: { xForwardedForHeader: false },
    message: { error: 'Muitos envios. Aguarde um momento.' }
});

// ── POST /api/leads ───────────────────────────────────────────
router.post('/', leadsLimiter, [
    body('nome').trim().isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    body('telefone').trim().isLength({ min: 8, max: 20 }).withMessage('Telefone inválido'),
    body('tipo_imovel').optional().isString().trim(),
    body('quartos').optional().isString().trim(),
    body('vagas').optional().isString().trim(),
    body('faixa_preco').optional().isFloat({ min: 0 }).withMessage('Faixa de preço inválida')
], (req, res) => {
    if (handleValidation(req, res)) return;

    const { nome, telefone, tipo_imovel, quartos, vagas, faixa_preco, origem, utm_source, session_id } = req.body;
    const preco = parseFloat(faixa_preco) || 0;
    const classificacao = preco >= HIGH_TICKET_THRESHOLD ? 'High Ticket' : 'Normal';

    const sql = `INSERT INTO leads_imobiliaria (nome, telefone, tipo_imovel, quartos, vagas, faixa_preco, classificacao, origem, utm_source, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
        stripHtml(nome), stripHtml(telefone), stripHtml(tipo_imovel || ''),
        stripHtml(quartos || ''), stripHtml(vagas || ''), preco, classificacao,
        stripHtml(origem || ''), stripHtml(utm_source || ''), stripHtml(session_id || '')
    ];

    db.run(sql, params, function(err) {
        if (err) { logger.error(`DB erro salvar lead: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }

        const leadId = this.lastID;
        logger.info(`LEAD #${leadId}: ${stripHtml(nome)} | ${stripHtml(telefone)} | ${classificacao}`);
        if (classificacao === 'High Ticket') {
            logger.info(`🔔 HIGH TICKET — ${stripHtml(nome)} — R$ ${preco.toLocaleString('pt-BR')}`);
        }
        res.status(201).json({ success: true, id: leadId, classificacao });
    });
});

// ── POST /api/leads/contato ───────────────────────────────────
router.post('/contato', leadsLimiter, [
    body('nome').trim().isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    body('telefone').trim().isLength({ min: 8, max: 20 }).withMessage('Telefone inválido'),
    body('email').optional().trim().isEmail().withMessage('E-mail inválido').normalizeEmail(),
    body('interesse').optional().isString().trim(),
    body('mensagem').optional().isString().trim().isLength({ max: 2000 }).withMessage('Mensagem muito longa'),
], (req, res) => {
    if (handleValidation(req, res)) return;

    const { nome, telefone, email, interesse, mensagem } = req.body;

    const sql = `INSERT INTO leads_imobiliaria (nome, telefone, tipo_imovel, email, mensagem, classificacao, origem) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [
        stripHtml(nome), stripHtml(telefone),
        stripHtml(interesse || 'Contato via site'),
        stripHtml(email || ''), stripHtml(mensagem || ''),
        'Normal', '/contato'
    ];

    db.run(sql, params, function(err) {
        if (err) { logger.error(`DB erro salvar contato: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }
        logger.info(`CONTATO #${this.lastID}: ${stripHtml(nome)} | ${stripHtml(email || telefone)}`);
        res.status(201).json({ success: true, id: this.lastID });
    });
});

// ── GET /api/leads ────────────────────────────────────────────
router.get('/', authMiddleware, [
    query('status').optional().isString().trim()
], (req, res) => {
    const { status } = req.query;
    let sql = 'SELECT * FROM leads_imobiliaria';
    const params = [];

    if (status && status !== 'todos') {
        sql += ' WHERE status = ?';
        params.push(status);
    }
    sql += ' ORDER BY criado_em DESC';

    db.all(sql, params, (err, rows) => {
        if (err) { logger.error(`DB erro buscar leads: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }
        res.json(rows);
    });
});

// ── PUT /api/leads/:id/status ─────────────────────────────────
router.put('/:id/status', authMiddleware, [
    param('id').isInt({ min: 1 }).withMessage('ID inválido'),
    body('status').isIn(['novo', 'em atendimento', 'convertido', 'descartado']).withMessage('Status inválido')
], (req, res) => {
    if (handleValidation(req, res)) return;

    const { id } = req.params;
    const { status } = req.body;

    db.run('UPDATE leads_imobiliaria SET status = ? WHERE id = ?', [status, id], function(err) {
        if (err) { logger.error(`DB erro atualizar lead ${id}: ${err.message}`); return res.status(500).json({ error: 'Erro interno' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'Lead não encontrado' });
        logger.info(`LEAD #${id} status → ${status}`);
        res.json({ success: true });
    });
});

module.exports = router;
