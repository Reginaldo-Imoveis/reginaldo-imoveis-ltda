const express = require('express');
const path = require('path');

const db = require('../db');
const { renderDetalhesSSR } = require('../lib/ssr');
const { generateSlug } = require('../lib/helpers');

const router = express.Router();
const frontendDir = path.join(__dirname, '../../frontend');

const page = (name) => path.join(frontendDir, name);

router.get('/', (req, res) => res.sendFile(page('index.html')));
router.get('/admin', (req, res) => res.sendFile(page('admin.html')));
router.get('/contato', (req, res) => res.sendFile(page('contato.html')));
router.get('/captacao', (req, res) => res.sendFile(page('captacao.html')));
router.get('/politica-de-privacidade', (req, res) => res.sendFile(page('politica-de-privacidade.html')));

router.get('/imoveis', (req, res) => res.redirect(301, '/#imoveis'));

// SEO-friendly slug URL: /imovel/apartamento-jardim-avelino-2
router.get('/imovel/:slug', (req, res) => {
    const match = req.params.slug.match(/-(\d+)$/);
    if (!match) return res.status(404).sendFile(page('index.html'));

    const id = parseInt(match[1]);
    db.get('SELECT * FROM imoveis WHERE id = ?', [id], (err, imovel) => {
        if (err || !imovel) return res.status(404).sendFile(page('index.html'));
        const slug = imovel.slug || generateSlug(imovel.titulo);
        res.send(renderDetalhesSSR(imovel, slug));
    });
});

// Legacy /detalhes?id=X → redirect to slug URL
router.get('/detalhes', (req, res) => {
    const id = parseInt(req.query.id);
    if (!id) return res.sendFile(page('detalhes.html'));

    db.get('SELECT titulo, slug FROM imoveis WHERE id = ?', [id], (err, row) => {
        if (err || !row) return res.sendFile(page('detalhes.html'));
        const slug = row.slug || generateSlug(row.titulo);
        res.redirect(301, `/imovel/${slug}-${id}`);
    });
});

module.exports = router;
