// =========================================================
// REGINALDO IMÓVEIS — Behavioral Lead Tracker
// =========================================================

(function () {
    const SESSION_KEY = 'ri_session';
    const UTM_KEY = 'ri_utm';
    const QUEUE_KEY = 'ri_track_queue';
    const FLUSH_INTERVAL = 10000;
    const PAGE_ENTER = Date.now();

    function getSessionId() {
        let sid = sessionStorage.getItem(SESSION_KEY);
        if (!sid) {
            sid = Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
            sessionStorage.setItem(SESSION_KEY, sid);
        }
        return sid;
    }

    function captureUtm() {
        const params = new URLSearchParams(window.location.search);
        const utm = {
            source: params.get('utm_source') || '',
            medium: params.get('utm_medium') || '',
            campaign: params.get('utm_campaign') || '',
            referrer: document.referrer || ''
        };
        if (utm.source || utm.referrer) {
            sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
        }
        return JSON.parse(sessionStorage.getItem(UTM_KEY) || '{}');
    }

    const sessionId = getSessionId();
    const utm = captureUtm();

    let queue = [];
    try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { queue = []; }

    function track(evento, dados) {
        const entry = {
            session_id: sessionId,
            evento,
            dados: typeof dados === 'object' ? JSON.stringify(dados) : String(dados || ''),
            pagina: window.location.pathname + window.location.search,
            imovel_id: getImovelId(),
            utm_source: utm.source || '',
            utm_medium: utm.medium || '',
            utm_campaign: utm.campaign || '',
            referrer: utm.referrer || '',
            ts: Date.now()
        };
        queue.push(entry);
        persistQueue();
    }

    function getImovelId() {
        const slugMatch = window.location.pathname.match(/-(\d+)$/);
        if (slugMatch) return parseInt(slugMatch[1]);
        const params = new URLSearchParams(window.location.search);
        return parseInt(params.get('id')) || null;
    }

    function persistQueue() {
        try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) {}
    }

    function flush() {
        if (!queue.length) return;
        const batch = queue.splice(0, 50);
        persistQueue();

        // Backend removido — eventos ficam em localStorage para análise futura
        queue.unshift(...batch);
        persistQueue();
    }

    // === TRACKING EVENTS ===

    // 1. Page view
    track('page_view', { title: document.title });

    // 2. Time on page (sent on leave)
    function trackTimeOnPage() {
        const seconds = Math.round((Date.now() - PAGE_ENTER) / 1000);
        if (seconds > 2) {
            const payload = JSON.stringify({
                session_id: sessionId,
                evento: 'time_on_page',
                dados: JSON.stringify({ seconds, page: window.location.pathname }),
                pagina: window.location.pathname + window.location.search,
                imovel_id: getImovelId(),
                ts: Date.now()
            });
            navigator.sendBeacon('/api/tracking/beacon', new Blob([payload], { type: 'application/json' }));
        }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') trackTimeOnPage();
    });

    // 3. WhatsApp clicks
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href*="wa.me"], .wpp-flutuante, .btn-whatsapp');
        if (link) {
            track('whatsapp_click', {
                href: link.href || '',
                location: link.closest('aside') ? 'detalhes_sidebar' :
                          link.classList.contains('wpp-flutuante') ? 'floating' :
                          link.closest('.cta-banner') ? 'cta_section' : 'other'
            });
            flush();
        }
    });

    // 4. Favorites
    const origToggle = window.toggleFavorito;
    if (typeof origToggle === 'function') {
        window.toggleFavorito = function (event, id) {
            const favs = JSON.parse(localStorage.getItem('reginaldo_favoritos') || '[]');
            const action = favs.includes(id) ? 'unfavorite' : 'favorite';
            track('favorite', { imovel_id: id, action });
            return origToggle.call(this, event, id);
        };
    }

    // 5. Searches
    const observer = new MutationObserver(() => {
        const btn = document.getElementById('btn-buscar');
        if (btn && !btn._tracked) {
            btn._tracked = true;
            btn.addEventListener('click', () => {
                const texto = document.getElementById('search-texto')?.value || '';
                const tipo = document.getElementById('search-tipo')?.value || '';
                const faixa = document.getElementById('search-faixa')?.value || '';
                track('search', { texto, tipo, faixa });
            });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 6. Property view (on detail pages — /imovel/:slug-:id)
    if (window.location.pathname.startsWith('/imovel/')) {
        const imovelId = getImovelId();
        if (imovelId) track('property_view', { imovel_id: imovelId });
    }

    // 7. Share clicks
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-compartilhar, .btn-compartilhar')) {
            track('share_click', { imovel_id: getImovelId() });
        }
    });

    // 8. Scroll depth
    let maxScroll = 0;
    let scrollTracked = {};
    window.addEventListener('scroll', () => {
        const pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
        if (pct > maxScroll) maxScroll = pct;
        [25, 50, 75, 100].forEach(threshold => {
            if (pct >= threshold && !scrollTracked[threshold]) {
                scrollTracked[threshold] = true;
                track('scroll_depth', { depth: threshold });
            }
        });
    }, { passive: true });

    // === FLUSH CYCLE ===
    setInterval(flush, FLUSH_INTERVAL);
    window.addEventListener('beforeunload', flush);

    // Expose for lead forms
    window.riTracker = { track, flush, sessionId, utm, getSessionId };
})();
