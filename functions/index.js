// =============================================================
// Reginaldo Imóveis — Cloud Function: OG Proxy para WhatsApp
// =============================================================
// Propósito: WhatsApp/Facebook/Telegram/LinkedIn não executam
// JavaScript. Esta função retorna HTML estático com as meta tags
// (Open Graph / Twitter) corretas para cada imóvel — foto, título,
// preço e descrição elegante — e depois redireciona o usuário para
// a página real no GitHub Pages.
//
// URL pública:
//   https://southamerica-east1-reginaldo-imoveis.cloudfunctions.net/imovel?id=<ID>
//
// Deploy:
//   firebase deploy --only functions
// =============================================================

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();

const BASE_URL  = 'https://www.reginaldoimoveisltda.com.br';
const CIDADE    = 'São Paulo';        // não há campo cidade no modelo — sempre SP
const FALLBACK_IMG = `${BASE_URL}/img/og-image.png`;

// Escapa entidades HTML para uso seguro dentro de atributos e texto
function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Formata valor monetário em pt-BR (R$ 1.500.000)
function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
    }).format(value || 0);
}

// Garante URL absoluta (imagens do Storage já vêm absolutas, mas é defensivo)
function toAbsolute(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return BASE_URL + (url.startsWith('/') ? '' : '/') + url;
}

// Detecta o mime-type da imagem pela extensão (antes da query string)
function imageMime(url) {
    const path = String(url).split('?')[0].toLowerCase();
    if (path.endsWith('.png'))  return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.gif'))  return 'image/gif';
    return 'image/jpeg';
}

// "à venda" / "para locação" / "à venda e para locação"
function finalidadePreposicao(finalidade) {
    const f = String(finalidade || 'Venda').toLowerCase();
    const venda  = f.includes('venda');
    const locacao = f.includes('loca');
    if (venda && locacao) return 'à venda e para locação';
    if (locacao)          return 'para locação';
    return 'à venda';
}

// Une lista em pt-BR: ["a","b","c"] → "a, b e c"
function juntarPt(arr) {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
}

// Pluraliza um atributo: (3,"quarto","quartos") → "3 quartos"
function plural(n, sing, plur) {
    return `${n} ${n === 1 ? sing : plur}`;
}

// =============================================================
// Descrição inteligente para compartilhamento social
// Ex.: "Apartamento à venda com 3 quartos, 1 suíte e 2 vagas em
//       Moema, São Paulo (120m²). Confira fotos, detalhes e
//       condições no site da Reginaldo Imóveis."
// =============================================================
function descricaoSocial(d) {
    const tipo  = d.tipo || 'Imóvel';
    const prep  = finalidadePreposicao(d.finalidade);
    const local = d.bairro ? `${d.bairro}, ${CIDADE}` : CIDADE;

    const specs = [];
    if (d.quartos > 0) specs.push(plural(d.quartos, 'quarto', 'quartos'));
    if (d.suites  > 0) specs.push(plural(d.suites,  'suíte',  'suítes'));
    if (d.vagas   > 0) specs.push(plural(d.vagas,   'vaga',   'vagas'));
    const comSpecs = specs.length ? ` com ${juntarPt(specs)}` : '';

    const area = d.areaUtil > 0 ? ` (${d.areaUtil}m²)` : '';

    return `${tipo} ${prep}${comSpecs} em ${local}${area}. `
         + `Confira fotos, detalhes e condições no site da Reginaldo Imóveis.`;
}

// =============================================================
// HTTP Function: imovel (Gen 1 — URL previsível)
// Região: southamerica-east1 (São Paulo) — baixa latência no BR
// =============================================================
exports.imovel = functions
    .region('southamerica-east1')
    .runWith({ memory: '128MB', timeoutSeconds: 10 })
    .https.onRequest(async (req, res) => {

        const id      = (req.query.id || '').trim();
        const realUrl = `${BASE_URL}/detalhes.html?id=${encodeURIComponent(id)}`;

        // Sem ID → redireciona para a home
        if (!id) {
            res.redirect(302, BASE_URL);
            return;
        }

        try {
            const snap = await admin.firestore()
                .collection('imoveis')
                .doc(id)
                .get();

            // Imóvel não existe → redireciona para a página real
            // (que exibirá o estado de erro correto)
            if (!snap.exists) {
                res.redirect(302, realUrl);
                return;
            }

            const d = snap.data();

            const preco       = formatBRL(d.preco);
            const titulo      = `${d.titulo} — ${preco}`;
            const tituloFull  = `${titulo} | Reginaldo Imóveis`;
            const descricao   = descricaoSocial(d);

            // Imagem principal → 1ª da galeria → fallback com logo
            let imgUrl = toAbsolute(d.imagem)
                || (Array.isArray(d.galeria) && d.galeria.length > 0 && toAbsolute(d.galeria[0]))
                || '';
            const usandoFallback = !imgUrl;
            if (usandoFallback) imgUrl = FALLBACK_IMG;

            const imgAlt  = `${d.titulo} — Reginaldo Imóveis`;
            const imgMime = usandoFallback ? 'image/png' : imageMime(imgUrl);

            // Cache de 5 minutos no CDN, 1 hora no browser
            res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
            res.set('Content-Type', 'text/html; charset=utf-8');

            res.status(200).send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${esc(tituloFull)}</title>
  <meta name="description" content="${esc(descricao)}">
  <!-- Página intermediária de proxy: não deve ser indexada (a canônica é a real) -->
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${esc(realUrl)}">

  <!-- ── Open Graph (WhatsApp · Facebook · Telegram · LinkedIn · iMessage) ── -->
  <meta property="og:type"            content="website">
  <meta property="og:site_name"       content="Reginaldo Imóveis">
  <meta property="og:locale"          content="pt_BR">
  <meta property="og:title"           content="${esc(titulo)}">
  <meta property="og:description"     content="${esc(descricao)}">
  <meta property="og:url"             content="${esc(realUrl)}">
  <meta property="og:image"           content="${esc(imgUrl)}">
  <meta property="og:image:secure_url" content="${esc(imgUrl)}">
  <meta property="og:image:alt"       content="${esc(imgAlt)}">
  <meta property="og:image:type"      content="${imgMime}">${usandoFallback ? `
  <meta property="og:image:width"     content="1200">
  <meta property="og:image:height"    content="630">` : ''}

  <!-- Preço (rich snippet de produto) -->
  <meta property="product:price:amount"   content="${esc(d.preco || 0)}">
  <meta property="product:price:currency" content="BRL">

  <!-- ── Twitter Card ── -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(titulo)}">
  <meta name="twitter:description" content="${esc(descricao)}">
  <meta name="twitter:image"       content="${esc(imgUrl)}">
  <meta name="twitter:image:alt"   content="${esc(imgAlt)}">

  <!-- ── Redirect imediato para a página real ── -->
  <!-- Bots (WhatsApp, Facebook…) param aqui e lêem os OG tags acima.
       Usuários humanos são redirecionados antes de notar qualquer coisa. -->
  <meta http-equiv="refresh" content="0;url=${esc(realUrl)}">
</head>
<body>
  <!-- Fallback para JS habilitado -->
  <script>window.location.replace(${JSON.stringify(realUrl)});</script>
  <!-- Fallback sem JS -->
  <p style="font-family:sans-serif;padding:2rem;text-align:center;">
    Redirecionando para o imóvel…
    <br><a href="${esc(realUrl)}">Clique aqui se não for redirecionado</a>
  </p>
</body>
</html>`);

        } catch (err) {
            console.error('[imovel-og] Erro ao buscar Firestore:', err);
            // Em caso de qualquer erro, redireciona para a página real
            res.redirect(302, realUrl);
        }
    });
