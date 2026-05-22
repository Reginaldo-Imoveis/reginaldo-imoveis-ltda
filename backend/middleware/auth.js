const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const logger = require('../lib/logger');

function authMiddleware(req, res, next) {
    const token =
        req.cookies?.accessToken ||
        req.headers['x-admin-token'] ||
        req.headers['authorization']?.replace('Bearer ', '');

    if (!token) {
        logger.warn(`ACESSO NEGADO: sem token — ${req.method} ${req.path} — IP: ${req.ip}`);
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        req.admin = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        logger.warn(`TOKEN INVÁLIDO: ${req.method} ${req.path} — IP: ${req.ip}`);
        return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
}

module.exports = { authMiddleware };
