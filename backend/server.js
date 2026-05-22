const express = require('express');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

require('./initDb');

const logger = require('./lib/logger');
const { PORT, CORS_ORIGIN } = require('./config');
const { uploadsDir } = require('./lib/upload');
const { scheduleDailyAt } = require('./lib/scheduler');
const { runBackup } = require('./backup');
const db = require('./db');

const { router: authRouter, loadTotpConfigFromDb } = require('./routes/auth');
const imoveisRouter = require('./routes/imoveis');
const leadsRouter = require('./routes/leads');
const trackingRouter = require('./routes/tracking');
const seoRouter = require('./routes/seo');
const pagesRouter = require('./routes/pages');

const app = express();

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://www.clarity.ms"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://images.unsplash.com", "https://cdnjs.cloudflare.com", "https://www.google-analytics.com", "https://analytics.google.com", "https://www.clarity.ms", "https://c.clarity.ms"],
            frameSrc: ["'self'", "https://www.google.com"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// ── Core middleware ───────────────────────────────────────────
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ── Request logging ───────────────────────────────────────────
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} — ${req.ip}`);
    next();
});

// ── Static files ──────────────────────────────────────────────
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
            if (/\.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
    }));
}
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1d',
    extensions: ['html'],
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        if (/\.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=86400');
        if (/\.(jpg|jpeg|png|webp|avif|svg)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800');
    }
}));

// ── Uploads — auto-serve WebP when available ──────────────────
app.use('/uploads', (req, res, next) => {
    const accept = req.headers.accept || '';
    if (accept.includes('image/webp') && /\.(jpg|jpeg|png)$/i.test(req.path)) {
        const webpPath = req.path.replace(/\.(jpg|jpeg|png)$/i, '.webp');
        const fullWebp = path.join(uploadsDir, webpPath);
        if (fs.existsSync(fullWebp)) {
            req.url = webpPath;
            res.setHeader('Content-Type', 'image/webp');
            res.setHeader('Vary', 'Accept');
        }
    }
    next();
});
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '7d',
    setHeaders: (res) => {
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
    }
}));

// ── Global API rate limiter ───────────────────────────────────
app.use('/api/', rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    validate: { xForwardedForHeader: false },
    message: { error: 'Limite de requisições excedido.' }
}));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/imoveis', imoveisRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/tracking', trackingRouter);
app.use('/', seoRouter);
app.use('/', pagesRouter);

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Arquivo muito grande. Máximo 5MB.' });
        if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Muitos arquivos. Máximo 21 por vez.' });
        return res.status(400).json({ error: 'Erro no upload: ' + err.message });
    }
    if (err.message?.includes('Tipo de arquivo não permitido')) {
        return res.status(400).json({ error: err.message });
    }
    logger.error(`ERRO NÃO TRATADO: ${err.message}\n${err.stack}`);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// ── Server startup ────────────────────────────────────────────
async function startServer() {
    await loadTotpConfigFromDb();

    app.listen(PORT, () => {
        logger.info(`Servidor rodando na porta ${PORT}`);
        logger.info(`Acesse http://localhost:${PORT}`);
    });

    scheduleDailyAt(3, 0, () => {
        logger.info('Iniciando backup agendado...');
        runBackup(logger);
    });

    setInterval(() => {
        db.run(`DELETE FROM revoked_tokens WHERE expires_at <= ?`, [Date.now()],
            (err) => { if (err) logger.error(`Erro na limpeza de tokens: ${err.message}`); }
        );
    }, 6 * 60 * 60 * 1000);
}

startServer();
