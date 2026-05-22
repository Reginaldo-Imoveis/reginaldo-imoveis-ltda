const express = require('express');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const { stripHtml } = require('../lib/helpers');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const trackingLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    validate: { xForwardedForHeader: false },
    message: { error: 'Rate limit' }
});

// ── POST /api/tracking ────────────────────────────────────────
router.post('/', trackingLimiter, (req, res) => {
    const { events } = req.body;
    if (!Array.isArray(events) || !events.length) return res.status(400).json({ error: 'Sem eventos' });

    const stmt = db.prepare(
        `INSERT INTO leads_tracking (session_id, evento, dados, pagina, imovel_id, utm_source, utm_medium, utm_campaign, referrer, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const ip = req.ip;
    const ua = req.headers['user-agent'] || '';

    events.slice(0, 50).forEach(e => {
        stmt.run([
            stripHtml(e.session_id || '').substring(0, 50),
            stripHtml(e.evento || '').substring(0, 50),
            (e.dados || '').substring(0, 500),
            stripHtml(e.pagina || '').substring(0, 200),
            parseInt(e.imovel_id) || null,
            stripHtml(e.utm_source || '').substring(0, 100),
            stripHtml(e.utm_medium || '').substring(0, 100),
            stripHtml(e.utm_campaign || '').substring(0, 100),
            stripHtml(e.referrer || '').substring(0, 500),
            ua.substring(0, 300),
            ip
        ]);
    });
    stmt.finalize();
    res.json({ success: true });
});

// ── POST /api/tracking/beacon ─────────────────────────────────
router.post('/beacon', trackingLimiter, (req, res) => {
    const e = req.body;
    if (!e || !e.session_id) return res.status(400).end();

    db.run(
        `INSERT INTO leads_tracking (session_id, evento, dados, pagina, imovel_id, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            stripHtml(e.session_id || '').substring(0, 50),
            stripHtml(e.evento || '').substring(0, 50),
            (e.dados || '').substring(0, 500),
            stripHtml(e.pagina || '').substring(0, 200),
            parseInt(e.imovel_id) || null,
            (req.headers['user-agent'] || '').substring(0, 300),
            req.ip
        ]
    );
    res.status(204).end();
});

// ── GET /api/tracking/stats ───────────────────────────────────
router.get('/stats', authMiddleware, (req, res) => {
    const stats = {};
    db.all(
        `SELECT evento, COUNT(*) as total FROM leads_tracking WHERE criado_em >= datetime('now', '-30 days') GROUP BY evento ORDER BY total DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Erro interno' });
            stats.eventos = rows;

            db.all(
                `SELECT imovel_id, COUNT(*) as views FROM leads_tracking WHERE evento = 'property_view' AND imovel_id IS NOT NULL AND criado_em >= datetime('now', '-30 days') GROUP BY imovel_id ORDER BY views DESC LIMIT 10`,
                [],
                (err2, top) => {
                    if (err2) return res.status(500).json({ error: 'Erro interno' });
                    stats.top_imoveis = top;

                    db.all(
                        `SELECT utm_source, COUNT(DISTINCT session_id) as sessions FROM leads_tracking WHERE utm_source != '' AND criado_em >= datetime('now', '-30 days') GROUP BY utm_source ORDER BY sessions DESC`,
                        [],
                        (err3, sources) => {
                            if (err3) return res.status(500).json({ error: 'Erro interno' });
                            stats.origens = sources;
                            res.json(stats);
                        }
                    );
                }
            );
        }
    );
});

// ── GET /api/tracking/analytics ───────────────────────────────
router.get('/analytics', authMiddleware, (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    db.all(
        `SELECT t.imovel_id, i.titulo, COUNT(*) as views
         FROM leads_tracking t
         LEFT JOIN imoveis i ON i.id = t.imovel_id
         WHERE t.evento = 'property_view' AND t.imovel_id IS NOT NULL
           AND t.criado_em >= datetime('now', '-' || ? || ' days')
         GROUP BY t.imovel_id ORDER BY views DESC LIMIT 10`,
        [days],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Erro interno' });
            res.json({ topProperties: rows || [] });
        }
    );
});

module.exports = router;
