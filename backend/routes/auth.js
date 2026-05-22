const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const logger = require('../lib/logger');
const { handleValidation } = require('../lib/helpers');
const { authMiddleware } = require('../middleware/auth');
const {
    JWT_SECRET, REFRESH_SECRET, ADMIN_PASSWORD_HASH,
    REFRESH_TTL_MS, NODE_ENV
} = require('../config');

const router = express.Router();

// ── Rate limiter ──────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (req, res) => {
        logger.warn(`RATE LIMIT: tentativas de login excedidas — IP: ${req.ip}`);
        res.status(429).json({ error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' });
    }
});

// ── TOTP (2FA) ────────────────────────────────────────────────
let totpConfig = { secret: null, enabled: false };

function loadTotpConfigFromDb() {
    return new Promise((resolve) => {
        db.get(`SELECT value FROM app_config WHERE key = 'totp'`, (err, row) => {
            if (err) { logger.error(`Erro ao ler TOTP config: ${err.message}`); resolve(); return; }
            if (row) {
                try { totpConfig = JSON.parse(row.value); } catch { logger.error('TOTP config corrompida no banco'); }
            }
            resolve();
        });
    });
}

function saveTotpConfig(config) {
    totpConfig = config;
    db.run(
        `INSERT OR REPLACE INTO app_config (key, value) VALUES ('totp', ?)`,
        [JSON.stringify(config)],
        (err) => { if (err) logger.error(`Erro ao salvar TOTP config: ${err.message}`); }
    );
}

function verifyTotp(code) {
    if (!totpConfig.enabled || !totpConfig.secret) return true;
    const totp = new TOTP({
        issuer: 'Reginaldo Imóveis', label: 'admin',
        algorithm: 'SHA1', digits: 6, period: 30,
        secret: Secret.fromBase32(totpConfig.secret)
    });
    return totp.validate({ token: code, window: 1 }) !== null;
}

// ── Refresh token blacklist ───────────────────────────────────
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function revokeToken(token) {
    const hash = hashToken(token);
    const expiresAt = Date.now() + REFRESH_TTL_MS;
    db.run(
        `INSERT OR IGNORE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)`,
        [hash, expiresAt],
        (err) => { if (err) logger.error(`Erro ao revogar token: ${err.message}`); }
    );
}

function isTokenRevoked(token) {
    return new Promise((resolve) => {
        const hash = hashToken(token);
        db.get(
            `SELECT 1 FROM revoked_tokens WHERE token_hash = ? AND expires_at > ?`,
            [hash, Date.now()],
            (err, row) => resolve(!!row)
        );
    });
}

// ── Routes ────────────────────────────────────────────────────
router.post('/', authLimiter, [
    body('password').isString().isLength({ min: 1 }).withMessage('Senha é obrigatória'),
    body('totp_code').optional().isString().trim()
], async (req, res) => {
    if (handleValidation(req, res)) return;

    const { password, totp_code } = req.body;

    const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!passwordMatch) {
        logger.warn(`LOGIN FALHOU — IP: ${req.ip}`);
        return res.status(401).json({ success: false, message: 'Senha incorreta' });
    }

    if (totpConfig.enabled) {
        if (!totp_code) {
            return res.json({ success: false, requires_2fa: true, message: 'Código 2FA necessário' });
        }
        if (!verifyTotp(totp_code)) {
            logger.warn(`2FA FALHOU — IP: ${req.ip}`);
            return res.status(401).json({ success: false, message: 'Código 2FA inválido' });
        }
    }

    const isSecure = NODE_ENV === 'production';
    const accessToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ role: 'admin', type: 'refresh' }, REFRESH_SECRET, { expiresIn: '7d' });

    res.cookie('accessToken', accessToken, {
        httpOnly: true, secure: isSecure, sameSite: 'strict', maxAge: 15 * 60 * 1000, path: '/'
    });
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true, secure: isSecure, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth'
    });

    logger.info(`LOGIN OK — IP: ${req.ip} — 2FA: ${totpConfig.enabled ? 'sim' : 'não'}`);
    res.json({ success: true, expiresIn: 900 });
});

router.post('/refresh', async (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token não fornecido' });
    }
    if (await isTokenRevoked(refreshToken)) {
        logger.warn(`REFRESH TOKEN REVOGADO — IP: ${req.ip}`);
        return res.status(403).json({ error: 'Token revogado' });
    }
    try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        if (decoded.type !== 'refresh') throw new Error('Tipo inválido');

        const newAccessToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '15m' });
        const isSecure = NODE_ENV === 'production';
        res.cookie('accessToken', newAccessToken, {
            httpOnly: true, secure: isSecure, sameSite: 'strict', maxAge: 15 * 60 * 1000, path: '/'
        });
        res.json({ success: true, expiresIn: 900 });
    } catch {
        logger.warn(`REFRESH INVÁLIDO — IP: ${req.ip}`);
        return res.status(403).json({ error: 'Refresh token inválido ou expirado' });
    }
});

router.post('/logout', (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
        try { jwt.verify(refreshToken, REFRESH_SECRET); revokeToken(refreshToken); } catch { /* inválido, ignora */ }
    }
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ success: true });
});

router.post('/2fa/setup', authMiddleware, async (req, res) => {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
        issuer: 'Reginaldo Imóveis', label: 'admin',
        algorithm: 'SHA1', digits: 6, period: 30, secret
    });
    try {
        const qrDataUrl = await QRCode.toDataURL(totp.toString());
        res.json({ success: true, secret: secret.base32, qrCode: qrDataUrl, uri: totp.toString() });
    } catch (err) {
        logger.error(`Erro ao gerar QR 2FA: ${err.message}`);
        res.status(500).json({ error: 'Erro ao gerar QR Code' });
    }
});

router.post('/2fa/enable', authMiddleware, [
    body('secret').isString().isLength({ min: 16 }).withMessage('Secret inválido'),
    body('code').isString().isLength({ min: 6, max: 6 }).withMessage('Código deve ter 6 dígitos')
], (req, res) => {
    if (handleValidation(req, res)) return;

    const { secret, code } = req.body;
    const totp = new TOTP({
        issuer: 'Reginaldo Imóveis', label: 'admin',
        algorithm: 'SHA1', digits: 6, period: 30,
        secret: Secret.fromBase32(secret)
    });

    if (totp.validate({ token: code, window: 1 }) === null) {
        return res.status(400).json({ error: 'Código inválido. Tente novamente.' });
    }

    saveTotpConfig({ secret, enabled: true });
    logger.info(`2FA ATIVADO — IP: ${req.ip}`);
    res.json({ success: true, message: '2FA ativado com sucesso' });
});

router.post('/2fa/disable', authMiddleware, [
    body('code').isString().isLength({ min: 6, max: 6 }).withMessage('Código deve ter 6 dígitos')
], (req, res) => {
    if (handleValidation(req, res)) return;

    if (!verifyTotp(req.body.code)) {
        return res.status(400).json({ error: 'Código inválido' });
    }

    saveTotpConfig({ secret: null, enabled: false });
    logger.info(`2FA DESATIVADO — IP: ${req.ip}`);
    res.json({ success: true, message: '2FA desativado' });
});

router.get('/2fa/status', authMiddleware, (req, res) => {
    res.json({ enabled: totpConfig.enabled });
});

module.exports = { router, loadTotpConfigFromDb };
