// =============================================================
// Reginaldo Imóveis — Cloud Function: OG Proxy para WhatsApp
// =============================================================
// Propósito: WhatsApp/Facebook não executam JavaScript.
// Esta função retorna HTML estático com as OG tags corretas para
// cada imóvel (foto, título, preço), depois redireciona o usuário
// para a página real no GitHub Pages.
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

const BASE_URL = 'https://www.reginaldoimoveisltda.com.br';

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

// =============================================================
// HTTP Function: imovel
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

            const preco     = formatBRL(d.preco);
            const titulo    = `${d.titulo} — ${preco} | Reginaldo Imóveis`;
            const finalidade = d.finalidade || 'Venda';
            const descBase  = d.descricao
                ? d.descricao.substring(0, 160)
                : `${d.tipo || 'Imóvel'} para ${finalidade} em ${d.bairro || 'São Paulo'} — ${preco}`;

            // Usa a primeira imagem da galeria, ou a capa, ou fallback genérico
            const imgUrl = d.imagem
                || (Array.isArray(d.galeria) && d.galeria.length > 0 && d.galeria[0])
                || `${BASE_URL}/img/og-image.png`;

            // Cache de 5 minutos no CDN, 1 hora no browser
            res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
            res.set('Content-Type', 'text/html; charset=utf-8');

            res.status(200).send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${esc(titulo)}</title>

  <!-- ── Open Graph (WhatsApp · Facebook · LinkedIn) ── -->
  <meta property="og:type"        content="product">
  <meta property="og:site_name"   content="Reginaldo Imóveis">
  <meta property="og:locale"      content="pt_BR">
  <meta property="og:title"       content="${esc(titulo)}">
  <meta property="og:description" content="${esc(descBase)}">
  <meta property="og:image"       content="${esc(imgUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height"content="630">
  <meta property="og:url"         content="${esc(realUrl)}">

  <!-- ── Twitter Card ── -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(titulo)}">
  <meta name="twitter:description" content="${esc(descBase)}">
  <meta name="twitter:image"       content="${esc(imgUrl)}">

  <!-- ── Redirect imediato para a página real ── -->
  <!-- Bots (WhatsApp, Facebook) param aqui e lêem os OG tags acima.
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
