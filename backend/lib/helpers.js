const { validationResult } = require('express-validator');

function stripHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
}

function generateSlug(titulo) {
    return titulo
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function handleValidation(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Dados inválidos', details: errors.array().map(e => e.msg) });
        return true;
    }
    return false;
}

module.exports = { stripHtml, generateSlug, handleValidation };
