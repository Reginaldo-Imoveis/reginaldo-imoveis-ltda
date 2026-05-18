const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, param, query, validationResult } = require('express-validator');
const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const winston = require('winston');
const db = require('./db');
require('./initDb');
require('dotenv').config();

// ============================================================
//  LOGGER (Winston)
// ============================================================
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(__dirname, '../logs/error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(__dirname, '../logs/combined.log') })
    ]
});

const fs = require('fs');
const crypto = require('crypto');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// ============================================================
//  CONFIG
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.JWT_SECRET || !process.env.REFRESH_SECRET || !process.env.ADMIN_PASSWORD_HASH) {
    logger.error('FATAL: JWT_SECRET, REFRESH_SECRET e ADMIN_PASSWORD_HASH devem estar definidos no .env');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const HIGH_TICKET_THRESHOLD = 1500000;
const SITE_URL = process.env.SITE_URL || 'https://www.reginaldoimoveis.com.br';

// ============================================================
//  2FA (TOTP) — estado persistido no banco de dados
// ============================================================
let totpConfig = { secret: null, enabled: false };

function loadTotpConfigFromDb() {
    return new Promise((resolve) => {
        db.get(`SELECT value FROM app_config WHERE key = 'totp'`, (err, row) => {
            if (err) { logger.error(`Erro ao ler TOTP config: ${err.message}`); resolve(); return; }
            if (row) {
                try { totpConfig = JSON.parse(row.value); } catch (e) { logger.error('TOTP config corrompida no banco'); }
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
    const totp = new TOTP({ issuer: 'Reginaldo Imóveis', label: 'admin', algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(totpConfig.secret) });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
}

// ============================================================
//  REFRESH TOKEN — blacklist persistida no banco
// ============================================================
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function revokeToken(token) {
    const hash = hashToken(token);
    const expiresAt = Date.now() + REFRESH_TTL_MS;
    db.run(`INSERT OR IGNORE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)`, [hash, expiresAt],
        (err) => { if (err) logger.error(`Erro ao revogar token: ${err.message}`); }
    );
}

function isTokenRevoked(token) {
    return new Promise((resolve) => {
        const hash = hashToken(token);
        db.get(`SELECT 1 FROM revoked_tokens WHERE token_hash = ? AND expires_at > ?`,
            [hash, Date.now()],
            (err, row) => resolve(!!row)
        );
    });
}

// ============================================================
//  IN-MEMORY CACHE (substitui Redis para este porte)
// ============================================================
const cache = new Map();
const CACHE_TTL = 60000;

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
    return entry.data;
}

function cacheSet(key, data) {
    cache.set(key, { data, ts: Date.now() });
}

function cacheInvalidate(pattern) {
    for (const k of cache.keys()) {
        if (k.startsWith(pattern)) cache.delete(k);
    }
}

// ============================================================
//  WEBP CONVERSION HELPER
// ============================================================
const sharp = require('sharp');

async function generateWebpVariants(filePath) {
    try {
        const ext = path.extname(filePath);
        if (!/\.(jpg|jpeg|png)$/i.test(ext)) return;
        const base = filePath.replace(/\.(jpg|jpeg|png)$/i, '');
        await sharp(filePath).webp({ quality: 80 }).toFile(base + '.webp');
        const meta = await sharp(filePath).metadata();
        for (const w of [400, 800, 1200]) {
            if (meta.width > w) {
                await sharp(filePath).resize(w).webp({ quality: 78 }).toFile(`${base}-${w}w.webp`);
            }
        }
    } catch (e) { logger.warn(`WebP conversion failed: ${e.message}`); }
}

// ============================================================
//  SLUG HELPER
// ============================================================
function generateSlug(titulo) {
    return titulo
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// ============================================================
//  MIDDLEWARES GLOBAIS
// ============================================================

// Helmet — headers de segurança (XSS, clickjacking, sniffing)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            // Helmet v7 define script-src-attr como 'none' por padrão, o que bloqueia
            // todos os onclick="" inline. Definir explicitamente resolve o problema.
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            // Inclui unsplash e cdnjs para imagens de fallback e bibliotecas externas
            connectSrc: ["'self'", "https://images.unsplash.com", "https://cdnjs.cloudflare.com"],
            frameSrc: ["'self'", "https://www.google.com"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    credentials: true
}));
app.use(compression({ level: 6, threshold: 1024 }));
const cookieParser = require('cookie-parser');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} — ${req.ip}`);
    next();
});

// Arquivos estáticos — dist/ (minificados) tem prioridade sobre originais
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
        if (/\.(jpg|jpeg|png|webp|avif|svg|webp)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800');
    }
}));
// Auto-serve WebP quando disponível
app.use('/uploads', (req, res, next) => {
    const accept = req.headers.accept || '';
    if (accept.includes('image/webp') && /\.(jpg|jpeg|png)$/i.test(req.path)) {
        const webpPath = req.path.replace(/\.(jpg|jpeg|png)$/i, '.webp');
        const fullWebp = path.join(__dirname, '../uploads', webpPath);
        if (fs.existsSync(fullWebp)) {
            req.url = webpPath;
            res.setHeader('Content-Type', 'image/webp');
            res.setHeader('Vary', 'Accept');
        }
    }
    next();
});
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    maxAge: '7d',
    setHeaders: (res) => {
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
    }
}));

// ============================================================
//  RATE LIMITING
// ============================================================
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (req, res) => {
        logger.warn(`RATE LIMIT: tentativas de login excedidas — IP: ${req.ip}`);
        res.status(429).json({ error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' });
    }
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    validate: { xForwardedForHeader: false },
    message: { error: 'Limite de requisições excedido.' }
});

const leadsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    validate: { xForwardedForHeader: false },
    message: { error: 'Muitos envios. Aguarde um momento.' }
});

app.use('/api/', apiLimiter);

// ============================================================
//  UPLOAD SEGURO (Multer)
// ============================================================
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const MAGIC_BYTES = {
    'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
    'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
    'image/webp': [Buffer.from('RIFF')]
};

function validateMagicBytes(filePath, mimetype) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(12);
        fs.readSync(fd, buf, 0, 12, 0);
        fs.closeSync(fd);

        const signatures = MAGIC_BYTES[mimetype];
        if (!signatures) return false;

        if (mimetype === 'image/webp') {
            return buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
        }
        return signatures.some(sig => buf.slice(0, sig.length).equals(sig));
    } catch { return false; }
}

// Garante que o diretório de uploads existe
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info('Diretório de uploads criado automaticamente.');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir + '/');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTS.includes(ext)) {
            return cb(new Error('Extensão não permitida. Use .jpg, .png ou .webp.'));
        }
        const safeName = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: 21 },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
            logger.warn(`UPLOAD REJEITADO: MIME ${file.mimetype} — IP: ${req.ip}`);
            return cb(new Error('Tipo de arquivo não permitido. Use JPG, PNG ou WebP.'), false);
        }
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTS.includes(ext)) {
            logger.warn(`UPLOAD REJEITADO: extensão ${ext} — IP: ${req.ip}`);
            return cb(new Error('Extensão não permitida. Use .jpg, .png ou .webp.'), false);
        }
        cb(null, true);
    }
});

const uploadFields = upload.fields([
    { name: 'imagem', maxCount: 1 },
    { name: 'galeria', maxCount: 20 }
]);

// ============================================================
//  MIDDLEWARE: JWT AUTH
// ============================================================
function authMiddleware(req, res, next) {
    const token = req.cookies?.accessToken || req.headers['x-admin-token'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!token) {
        logger.warn(`ACESSO NEGADO: sem token — ${req.method} ${req.path} — IP: ${req.ip}`);
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        logger.warn(`TOKEN INVÁLIDO: ${req.method} ${req.path} — IP: ${req.ip}`);
        return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
}

// ============================================================
//  HELPERS: Sanitização e Validação
// ============================================================
function stripHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
}

function handleValidation(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Dados inválidos', details: errors.array().map(e => e.msg) });
    }
    return null;
}

// ============================================================
//  ROTAS: AUTENTICAÇÃO
// ============================================================
app.post('/api/auth', authLimiter, [
    body('password').isString().isLength({ min: 1 }).withMessage('Senha é obrigatória'),
    body('totp_code').optional().isString().trim()
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    const { password, totp_code } = req.body;

    if (!bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
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

    const accessToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ role: 'admin', type: 'refresh' }, REFRESH_SECRET, { expiresIn: '7d' });

    const isSecure = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
        httpOnly: true, secure: isSecure, sameSite: 'strict', maxAge: 15 * 60 * 1000, path: '/'
    });
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true, secure: isSecure, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth'
    });

    logger.info(`LOGIN OK — IP: ${req.ip} — 2FA: ${totpConfig.enabled ? 'sim' : 'não'}`);
    res.json({ success: true, expiresIn: 900 });
});

// Refresh token — gera novo access token
app.post('/api/auth/refresh', async (req, res) => {
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
        const isSecure = process.env.NODE_ENV === 'production';
        res.cookie('accessToken', newAccessToken, {
            httpOnly: true, secure: isSecure, sameSite: 'strict', maxAge: 15 * 60 * 1000, path: '/'
        });
        res.json({ success: true, expiresIn: 900 });
    } catch (err) {
        logger.warn(`REFRESH INVÁLIDO — IP: ${req.ip}`);
        return res.status(403).json({ error: 'Refresh token inválido ou expirado' });
    }
});

// Logout — revoga refresh token e limpa cookies
app.post('/api/auth/logout', (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
        try {
            jwt.verify(refreshToken, REFRESH_SECRET);
            revokeToken(refreshToken);
        } catch (e) { /* token inválido, ignora */ }
    }
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ success: true });
});

// ============================================================
//  ROTAS: 2FA (TOTP) — setup e verificação
// ============================================================
app.post('/api/auth/2fa/setup', authMiddleware, async (req, res) => {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({ issuer: 'Reginaldo Imóveis', label: 'admin', algorithm: 'SHA1', digits: 6, period: 30, secret });
    const uri = totp.toString();

    try {
        const qrDataUrl = await QRCode.toDataURL(uri);
        res.json({
            success: true,
            secret: secret.base32,
            qrCode: qrDataUrl,
            uri
        });
    } catch (err) {
        logger.error(`Erro ao gerar QR 2FA: ${err.message}`);
        res.status(500).json({ error: 'Erro ao gerar QR Code' });
    }
});

app.post('/api/auth/2fa/enable', authMiddleware, [
    body('secret').isString().isLength({ min: 16 }).withMessage('Secret inválido'),
    body('code').isString().isLength({ min: 6, max: 6 }).withMessage('Código deve ter 6 dígitos')
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    const { secret, code } = req.body;
    const totp = new TOTP({ issuer: 'Reginaldo Imóveis', label: 'admin', algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) });
    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
        return res.status(400).json({ error: 'Código inválido. Tente novamente.' });
    }

    totpConfig = { secret, enabled: true };
    saveTotpConfig(totpConfig);
    logger.info(`2FA ATIVADO — IP: ${req.ip}`);
    res.json({ success: true, message: '2FA ativado com sucesso' });
});

app.post('/api/auth/2fa/disable', authMiddleware, [
    body('code').isString().isLength({ min: 6, max: 6 }).withMessage('Código deve ter 6 dígitos')
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    if (!verifyTotp(req.body.code)) {
        return res.status(400).json({ error: 'Código inválido' });
    }

    totpConfig = { secret: null, enabled: false };
    saveTotpConfig(totpConfig);
    logger.info(`2FA DESATIVADO — IP: ${req.ip}`);
    res.json({ success: true, message: '2FA desativado' });
});

app.get('/api/auth/2fa/status', authMiddleware, (req, res) => {
    res.json({ enabled: totpConfig.enabled });
});

// ============================================================
//  ROTAS: IMÓVEIS (Público)
// ============================================================
app.get('/api/imoveis', [
    query('tipo').optional().isString().trim(),
    query('busca').optional().isString().trim(),
    query('finalidade').optional().isIn(['Venda', 'Locação', 'todos']),
    query('preco_min').optional().isFloat({ min: 0 }),
    query('preco_max').optional().isFloat({ min: 0 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 })
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    const cacheKey = 'imoveis:' + JSON.stringify(req.query);
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const { tipo, busca, finalidade, preco_min, preco_max } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let queryStr = 'SELECT * FROM imoveis WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM imoveis WHERE 1=1';
    let params = [];
    let countParams = [];

    if (tipo && tipo !== 'todos') {
        queryStr += ' AND tipo = ?';
        countQuery += ' AND tipo = ?';
        params.push(tipo);
        countParams.push(tipo);
    }
    if (finalidade && finalidade !== 'todos') {
        queryStr += ' AND finalidade = ?';
        countQuery += ' AND finalidade = ?';
        params.push(finalidade);
        countParams.push(finalidade);
    }
    if (preco_min) {
        queryStr += ' AND preco >= ?';
        countQuery += ' AND preco >= ?';
        params.push(parseFloat(preco_min));
        countParams.push(parseFloat(preco_min));
    }
    if (preco_max) {
        queryStr += ' AND preco <= ?';
        countQuery += ' AND preco <= ?';
        params.push(parseFloat(preco_max));
        countParams.push(parseFloat(preco_max));
    }
    if (busca) {
        const term = '%' + stripHtml(busca) + '%';
        queryStr += ' AND (titulo LIKE ? OR descricao LIKE ?)';
        countQuery += ' AND (titulo LIKE ? OR descricao LIKE ?)';
        params.push(term, term);
        countParams.push(term, term);
    }

    queryStr += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    db.get(countQuery, countParams, (err, countRow) => {
        if (err) {
            logger.error(`DB erro imoveis count: ${err.message}`);
            return res.status(500).json({ error: 'Erro interno' });
        }

        db.all(queryStr, params, (err2, rows) => {
            if (err2) {
                logger.error(`DB erro imoveis: ${err2.message}`);
                return res.status(500).json({ error: 'Erro interno' });
            }

            const total = countRow?.total || 0;
            const result = {
                data: rows,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) }
            };
            cacheSet(cacheKey, result);
            res.json(result);
        });
    });
});

app.get('/api/imoveis/:id', [
    param('id').isInt({ min: 1 }).withMessage('ID inválido')
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    db.get('SELECT * FROM imoveis WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            logger.error(`DB erro imovel ${req.params.id}: ${err.message}`);
            return res.status(500).json({ error: 'Erro interno' });
        }
        if (!row) return res.status(404).json({ error: 'Imóvel não encontrado' });
        res.json(row);
    });
});

// ============================================================
//  ROTAS: IMÓVEIS (Admin — protegidas por JWT)
// ============================================================
app.post('/api/imoveis', authMiddleware, uploadFields, (req, res) => {
    const allFiles = [...(req.files?.imagem || []), ...(req.files?.galeria || [])];
    for (const f of allFiles) {
        if (!validateMagicBytes(f.path, f.mimetype)) {
            logger.warn(`UPLOAD REJEITADO: magic bytes inválidos — ${f.originalname} (${f.mimetype}) — IP: ${req.ip}`);
            fs.unlinkSync(f.path);
            return res.status(400).json({ error: 'Arquivo inválido — conteúdo não corresponde ao tipo declarado.' });
        }
    }

    // Generate WebP variants in background
    allFiles.forEach(f => generateWebpVariants(f.path).catch(() => {}));

    const { titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, status, finalidade, mapa_url } = req.body;

    if (!titulo || !tipo) {
        return res.status(400).json({ error: 'Título e tipo são obrigatórios' });
    }

    let imagemUrl = '';
    if (req.files?.imagem?.[0]) imagemUrl = '/uploads/' + req.files.imagem[0].filename;
    const galeriaUrls = (req.files?.galeria || []).map(f => '/uploads/' + f.filename);

    const slug = generateSlug(titulo);
    const query = 'INSERT INTO imoveis (titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, imagem, galeria, mapa_url, status, finalidade, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const params = [
        stripHtml(titulo), stripHtml(tipo), parseFloat(preco) || 0, stripHtml(descricao || ''),
        parseInt(quartos) || 0, parseInt(vagas) || 0, parseInt(suites) || 0,
        parseFloat(areaUtil) || 0, parseFloat(areaTotal) || 0, imagemUrl,
        JSON.stringify(galeriaUrls), stripHtml(mapa_url || ''), status || 'Disponível', finalidade || 'Venda', slug
    ];

    db.run(query, params, function(err) {
        if (err) {
            logger.error(`DB erro criar imovel: ${err.message}`);
            return res.status(500).json({ error: 'Erro interno' });
        }
        cacheInvalidate('imoveis');
        cacheInvalidate('sitemap');
        logger.info(`IMÓVEL CRIADO: #${this.lastID} "${stripHtml(titulo)}" — admin`);
        res.status(201).json({ success: true, id: this.lastID });
    });
});

app.put('/api/imoveis/:id', authMiddleware, uploadFields, [
    param('id').isInt({ min: 1 }).withMessage('ID inválido')
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    const allFiles = [...(req.files?.imagem || []), ...(req.files?.galeria || [])];
    for (const f of allFiles) {
        if (!validateMagicBytes(f.path, f.mimetype)) {
            logger.warn(`UPLOAD REJEITADO: magic bytes inválidos — ${f.originalname} (${f.mimetype}) — IP: ${req.ip}`);
            fs.unlinkSync(f.path);
            return res.status(400).json({ error: 'Arquivo inválido — conteúdo não corresponde ao tipo declarado.' });
        }
    }

    allFiles.forEach(f => generateWebpVariants(f.path).catch(() => {}));

    const { id } = req.params;
    const { titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, status, finalidade, mapa_url } = req.body;

    db.get('SELECT imagem, galeria FROM imoveis WHERE id = ?', [id], (err, row) => {
        if (err) {
            logger.error(`DB erro buscar imovel ${id}: ${err.message}`);
            return res.status(500).json({ error: 'Erro interno' });
        }
        if (!row) return res.status(404).json({ error: 'Imóvel não encontrado' });

        let imagemUrl = row.imagem;
        if (req.files?.imagem?.[0]) imagemUrl = '/uploads/' + req.files.imagem[0].filename;

        let galeriaUrls;
        if (req.files?.galeria?.length) {
            const novas = req.files.galeria.map(f => '/uploads/' + f.filename);
            const existentes = JSON.parse(row.galeria || '[]');
            galeriaUrls = [...existentes, ...novas];
        } else {
            galeriaUrls = JSON.parse(row.galeria || '[]');
        }

        const slug = generateSlug(titulo);
        const query = 'UPDATE imoveis SET titulo=?, tipo=?, preco=?, descricao=?, quartos=?, vagas=?, suites=?, areaUtil=?, areaTotal=?, imagem=?, galeria=?, mapa_url=?, status=?, finalidade=?, slug=? WHERE id=?';
        const params = [
            stripHtml(titulo), stripHtml(tipo), parseFloat(preco) || 0, stripHtml(descricao || ''),
            parseInt(quartos) || 0, parseInt(vagas) || 0, parseInt(suites) || 0,
            parseFloat(areaUtil) || 0, parseFloat(areaTotal) || 0,
            imagemUrl, JSON.stringify(galeriaUrls), stripHtml(mapa_url || ''), status || 'Disponível', finalidade || 'Venda', slug, id
        ];

        db.run(query, params, function(err2) {
            if (err2) {
                logger.error(`DB erro atualizar imovel ${id}: ${err2.message}`);
                return res.status(500).json({ error: 'Erro interno' });
            }
            cacheInvalidate('imoveis');
            cacheInvalidate('sitemap');
            logger.info(`IMÓVEL ATUALIZADO: #${id} — admin`);
            res.json({ success: true, id: parseInt(id) });
        });
    });
});

app.delete('/api/imoveis/:id', authMiddleware, [
    param('id').isInt({ min: 1 }).withMessage('ID inválido')
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    const { id } = req.params;

    db.run('DELETE FROM imoveis WHERE id = ?', [id], function(err) {
        if (err) {
            logger.error(`DB erro deletar imovel ${id}: ${err.message}`);
            return res.status(500).json({ error: 'Erro interno' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Imóvel não encontrado' });
        cacheInvalidate('imoveis');
        cacheInvalidate('sitemap');
        logger.info(`IMÓVEL DELETADO: #${id} — admin`);
        res.json({ success: true });
    });
});

// ============================================================
//  ROTAS: LEADS
// ============================================================
app.post('/api/leads', leadsLimiter, [
    body('nome').trim().isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    body('telefone').trim().isLength({ min: 8, max: 20 }).withMessage('Telefone inválido'),
    body('tipo_imovel').optional().isString().trim(),
    body('quartos').optional().isString().trim(),
    body('vagas').optional().isString().trim(),
    body('faixa_preco').optional().isFloat({ min: 0 }).withMessage('Faixa de preço inválida')
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    const { nome, telefone, tipo_imovel, quartos, vagas, faixa_preco, origem, utm_source, session_id } = req.body;
    const preco = parseFloat(faixa_preco) || 0;
    const classificacao = preco >= HIGH_TICKET_THRESHOLD ? 'High Ticket' : 'Normal';

    const query = `INSERT INTO leads_imobiliaria (nome, telefone, tipo_imovel, quartos, vagas, faixa_preco, classificacao, origem, utm_source, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [stripHtml(nome), stripHtml(telefone), stripHtml(tipo_imovel || ''), stripHtml(quartos || ''), stripHtml(vagas || ''), preco, classificacao, stripHtml(origem || ''), stripHtml(utm_source || ''), stripHtml(session_id || '')];

    db.run(query, params, function(err) {
        if (err) {
            logger.error(`DB erro salvar lead: ${err.message}`);
            return res.status(500).json({ error: 'Erro interno' });
        }

        const leadId = this.lastID;
        logger.info(`LEAD #${leadId}: ${stripHtml(nome)} | ${stripHtml(telefone)} | ${classificacao}`);

        if (classificacao === 'High Ticket') {
            logger.info(`🔔 HIGH TICKET — ${stripHtml(nome)} — R$ ${preco.toLocaleString('pt-BR')}`);
        }

        res.status(201).json({ success: true, id: leadId, classificacao });
    });
});

app.get('/api/leads', authMiddleware, [
    query('status').optional().isString().trim()
], (req, res) => {
    const { status } = req.query;
    let queryStr = 'SELECT * FROM leads_imobiliaria';
    let params = [];

    if (status && status !== 'todos') {
        queryStr += ' WHERE status = ?';
        params.push(status);
    }

    queryStr += ' ORDER BY criado_em DESC';

    db.all(queryStr, params, (err, rows) => {
        if (err) {
            logger.error(`DB erro buscar leads: ${err.message}`);
            return res.status(500).json({ error: 'Erro interno' });
        }
        res.json(rows);
    });
});

app.put('/api/leads/:id/status', authMiddleware, [
    param('id').isInt({ min: 1 }).withMessage('ID inválido'),
    body('status').isIn(['novo', 'em atendimento', 'convertido', 'descartado']).withMessage('Status inválido')
], (req, res) => {
    const valError = handleValidation(req, res);
    if (valError) return;

    const { id } = req.params;
    const { status } = req.body;

    db.run('UPDATE leads_imobiliaria SET status = ? WHERE id = ?', [status, id], function(err) {
        if (err) {
            logger.error(`DB erro atualizar lead ${id}: ${err.message}`);
            return res.status(500).json({ error: 'Erro interno' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Lead não encontrado' });
        logger.info(`LEAD #${id} status → ${status}`);
        res.json({ success: true });
    });
});

// ============================================================
//  ROTAS: TRACKING COMPORTAMENTAL
// ============================================================
const trackingLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    validate: { xForwardedForHeader: false },
    message: { error: 'Rate limit' }
});

app.post('/api/tracking', trackingLimiter, (req, res) => {
    const { events } = req.body;
    if (!Array.isArray(events) || !events.length) return res.status(400).json({ error: 'Sem eventos' });

    const stmt = db.prepare(`INSERT INTO leads_tracking (session_id, evento, dados, pagina, imovel_id, utm_source, utm_medium, utm_campaign, referrer, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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

app.post('/api/tracking/beacon', trackingLimiter, (req, res) => {
    const e = req.body;
    if (!e || !e.session_id) return res.status(400).end();

    db.run(`INSERT INTO leads_tracking (session_id, evento, dados, pagina, imovel_id, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [stripHtml(e.session_id || '').substring(0, 50), stripHtml(e.evento || '').substring(0, 50), (e.dados || '').substring(0, 500), stripHtml(e.pagina || '').substring(0, 200), parseInt(e.imovel_id) || null, (req.headers['user-agent'] || '').substring(0, 300), req.ip]
    );
    res.status(204).end();
});

app.get('/api/tracking/stats', authMiddleware, (req, res) => {
    const stats = {};
    db.all(`SELECT evento, COUNT(*) as total FROM leads_tracking WHERE criado_em >= datetime('now', '-30 days') GROUP BY evento ORDER BY total DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro interno' });
        stats.eventos = rows;

        db.all(`SELECT imovel_id, COUNT(*) as views FROM leads_tracking WHERE evento = 'property_view' AND imovel_id IS NOT NULL AND criado_em >= datetime('now', '-30 days') GROUP BY imovel_id ORDER BY views DESC LIMIT 10`, [], (err2, top) => {
            if (err2) return res.status(500).json({ error: 'Erro interno' });
            stats.top_imoveis = top;

            db.all(`SELECT utm_source, COUNT(DISTINCT session_id) as sessions FROM leads_tracking WHERE utm_source != '' AND criado_em >= datetime('now', '-30 days') GROUP BY utm_source ORDER BY sessions DESC`, [], (err3, sources) => {
                if (err3) return res.status(500).json({ error: 'Erro interno' });
                stats.origens = sources;
                res.json(stats);
            });
        });
    });
});

app.get('/api/tracking/analytics', authMiddleware, (req, res) => {
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

// ============================================================
//  SEO: SITEMAP.XML DINÂMICO
// ============================================================
app.get('/sitemap.xml', (req, res) => {
    const cached = cacheGet('sitemap');
    if (cached) {
        res.set('Content-Type', 'application/xml');
        return res.send(cached);
    }

    db.all('SELECT id, titulo, slug, createdAt FROM imoveis ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).end();

        const today = new Date().toISOString().split('T')[0];
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/contato</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${SITE_URL}/captacao</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${SITE_URL}/politica-de-privacidade</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.3</priority></url>
`;
        rows.forEach(r => {
            const slug = r.slug || generateSlug(r.titulo);
            const date = r.createdAt ? r.createdAt.split(' ')[0] : today;
            xml += `  <url><loc>${SITE_URL}/imovel/${slug}-${r.id}</loc><lastmod>${date}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
        });
        xml += '</urlset>';

        cacheSet('sitemap', xml);
        res.set('Content-Type', 'application/xml');
        res.send(xml);
    });
});

// ============================================================
//  SEO: ROBOTS.TXT
// ============================================================
app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /uploads/

Sitemap: ${SITE_URL}/sitemap.xml`);
});

// ============================================================
//  SSR: DETALHES COM META TAGS DINÂMICAS (para crawlers)
// ============================================================
const detalhesHtml = fs.readFileSync(path.join(__dirname, '../frontend/detalhes.html'), 'utf-8');

function renderDetalhesSSR(imovel, slug) {
    const preco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(imovel.preco);
    const desc = (imovel.descricao || `${imovel.tipo} de alto padrão em São Paulo`).substring(0, 160);
    const imgUrl = imovel.imagem && imovel.imagem.startsWith('/') ? SITE_URL + imovel.imagem : imovel.imagem || '';
    const pageUrl = `${SITE_URL}/imovel/${slug}-${imovel.id}`;
    const title = `${imovel.titulo} — ${preco} | Reginaldo Imóveis`;

    let html = detalhesHtml;

    html = html.replace('<title>Detalhes do Imóvel | Reginaldo Imóveis</title>', `<title>${title}</title>`);
    html = html.replace('content="Imóvel de alto padrão em São Paulo. Reginaldo Imóveis — CRECI 17407-J."', `content="${desc}"`);
    html = html.replace('content="Imóvel | Reginaldo Imóveis"', `content="${title}"`);
    html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`);
    html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${desc}">`);
    html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${imgUrl}">`);
    html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${pageUrl}">`);
    html = html.replace(/<meta property="product:price:amount" content="[^"]*">/, `<meta property="product:price:amount" content="${imovel.preco}">`);
    html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`);
    html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${desc}">`);
    html = html.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${imgUrl}">`);

    const canonical = `<link rel="canonical" href="${pageUrl}">`;
    html = html.replace('</head>', `${canonical}\n</head>`);

    return html;
}

// ============================================================
//  ROTAS: FRONTEND (páginas HTML)
// ============================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));
app.get('/contato', (req, res) => res.sendFile(path.join(__dirname, '../frontend/contato.html')));
app.get('/captacao', (req, res) => res.sendFile(path.join(__dirname, '../frontend/captacao.html')));
app.get('/politica-de-privacidade', (req, res) => res.sendFile(path.join(__dirname, '../frontend/politica-de-privacidade.html')));

// SEO-friendly slug URL: /imovel/apartamento-jardim-avelino-2
app.get('/imovel/:slug', (req, res) => {
    const match = req.params.slug.match(/-(\d+)$/);
    if (!match) return res.status(404).sendFile(path.join(__dirname, '../frontend/index.html'));

    const id = parseInt(match[1]);
    db.get('SELECT * FROM imoveis WHERE id = ?', [id], (err, imovel) => {
        if (err || !imovel) return res.status(404).sendFile(path.join(__dirname, '../frontend/index.html'));
        const slug = imovel.slug || generateSlug(imovel.titulo);
        res.send(renderDetalhesSSR(imovel, slug));
    });
});

// Legacy /detalhes?id=X — redirect to slug URL
app.get('/detalhes', (req, res) => {
    const id = parseInt(req.query.id);
    if (!id) return res.sendFile(path.join(__dirname, '../frontend/detalhes.html'));

    db.get('SELECT titulo, slug FROM imoveis WHERE id = ?', [id], (err, row) => {
        if (err || !row) return res.sendFile(path.join(__dirname, '../frontend/detalhes.html'));
        const slug = row.slug || generateSlug(row.titulo);
        res.redirect(301, `/imovel/${slug}-${id}`);
    });
});

// ============================================================
//  ERROR HANDLER GLOBAL
// ============================================================
app.use((err, req, res, next) => {
    // Multer errors
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Arquivo muito grande. Máximo 5MB.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Muitos arquivos. Máximo 21 por vez.' });
        }
        return res.status(400).json({ error: 'Erro no upload: ' + err.message });
    }

    if (err.message?.includes('Tipo de arquivo não permitido')) {
        return res.status(400).json({ error: err.message });
    }

    logger.error(`ERRO NÃO TRATADO: ${err.message}\n${err.stack}`);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// ============================================================
//  START
// ============================================================
const { runBackup } = require('./backup');

async function startServer() {
    await loadTotpConfigFromDb();
    logger.info(`2FA status: ${totpConfig.enabled ? 'ativado' : 'desativado'}`);

    app.listen(PORT, () => {
        logger.info(`Servidor rodando na porta ${PORT}`);
        logger.info(`Acesse http://localhost:${PORT}`);
    });

    // Backup diário às 03:00
    scheduleDailyAt(3, 0, () => {
        logger.info('Iniciando backup agendado...');
        runBackup(logger);
    });

    // Limpeza de tokens expirados — a cada 6 horas
    setInterval(() => {
        db.run(`DELETE FROM revoked_tokens WHERE expires_at <= ?`, [Date.now()],
            (err) => { if (err) logger.error(`Erro na limpeza de tokens: ${err.message}`); }
        );
    }, 6 * 60 * 60 * 1000);
}

function scheduleDailyAt(hour, minute, fn) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next - now;
    setTimeout(() => { fn(); setInterval(fn, 24 * 60 * 60 * 1000); }, delay);
}

startServer();
