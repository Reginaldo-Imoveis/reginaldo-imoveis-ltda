const express = require('express');

const db = require('../db');
const { cacheGet, cacheSet } = require('../lib/cache');
const { generateSlug } = require('../lib/helpers');
const { SITE_URL } = require('../config');

const router = express.Router();

// ── GET /sitemap.xml ──────────────────────────────────────────
router.get('/sitemap.xml', (req, res) => {
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

// ── GET /robots.txt ───────────────────────────────────────────
router.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(
        `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /uploads/\n\nSitemap: ${SITE_URL}/sitemap.xml`
    );
});

module.exports = router;
