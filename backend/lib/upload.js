const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const logger = require('./logger');

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const MAGIC_BYTES = {
    'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
    'image/png':  [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
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

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info('Diretório de uploads criado automaticamente.');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir + '/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTS.includes(ext)) {
            return cb(new Error('Extensão não permitida. Use .jpg, .png ou .webp.'));
        }
        cb(null, Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext);
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

module.exports = { upload, uploadFields, validateMagicBytes, generateWebpVariants, uploadsDir };
