require('dotenv').config();

const logger = require('./lib/logger');

if (!process.env.JWT_SECRET || !process.env.REFRESH_SECRET || !process.env.ADMIN_PASSWORD_HASH) {
    logger.error('FATAL: JWT_SECRET, REFRESH_SECRET e ADMIN_PASSWORD_HASH devem estar definidos no .env');
    process.exit(1);
}

module.exports = {
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    JWT_SECRET: process.env.JWT_SECRET,
    REFRESH_SECRET: process.env.REFRESH_SECRET,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    CORS_ORIGIN: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    SITE_URL: process.env.SITE_URL || 'https://www.reginaldoimoveis.com.br',
    HIGH_TICKET_THRESHOLD: 1500000,
    CACHE_TTL: 60000,
    REFRESH_TTL_MS: 7 * 24 * 60 * 60 * 1000,
};
