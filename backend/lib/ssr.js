const fs = require('fs');
const path = require('path');
const { SITE_URL } = require('../config');

const detalhesHtml = fs.readFileSync(
    path.join(__dirname, '../../frontend/detalhes.html'),
    'utf-8'
);

function renderDetalhesSSR(imovel, slug) {
    const preco = new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', minimumFractionDigits: 0
    }).format(imovel.preco);

    const desc = (imovel.descricao || `${imovel.tipo} de alto padrão em São Paulo`).substring(0, 160);
    const imgUrl = imovel.imagem?.startsWith('/') ? SITE_URL + imovel.imagem : (imovel.imagem || '');
    const pageUrl = `${SITE_URL}/imovel/${slug}-${imovel.id}`;
    const title = `${imovel.titulo} — ${preco} | Reginaldo Imóveis`;

    let html = detalhesHtml;

    html = html.replace(
        '<title>Detalhes do Imóvel | Reginaldo Imóveis</title>',
        `<title>${title}</title>`
    );
    html = html.replace(
        'content="Imóvel de alto padrão em São Paulo. Reginaldo Imóveis — CRECI 17407-J."',
        `content="${desc}"`
    );
    html = html.replace(
        'content="Imóvel | Reginaldo Imóveis"',
        `content="${title}"`
    );
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

module.exports = { renderDetalhesSSR };
