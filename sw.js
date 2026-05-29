const CACHE_NAME = 'ri-shell-v8';
const SHELL_ASSETS = [
    '/',
    '/css/style.css?v=17',
    '/js/main.js?v=17',
    '/js/tracker.js',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'ri-images-v1').map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    if (e.request.method !== 'GET') return;
    if (url.pathname.startsWith('/api/')) return;
    if (url.pathname.startsWith('/admin')) return;
    // Nunca cachear arquivos para crawlers — devem sempre vir da rede
    if (url.pathname === '/sitemap.xml' || url.pathname === '/robots.txt') return;

    // Não interceptar URLs externas — deixa o browser lidar com elas diretamente
    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/uploads/')) {
        e.respondWith(
            caches.open('ri-images-v1').then(cache =>
                cache.match(e.request).then(cached => {
                    if (cached) return cached;
                    return fetch(e.request).then(res => {
                        if (res.ok) cache.put(e.request, res.clone());
                        return res;
                    }).catch(() => cached || new Response('', { status: 404 }));
                })
            )
        );
        return;
    }

    // Network-first para HTML (garante conteúdo sempre atualizado)
    if (url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    if (res.ok) {
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
                    }
                    return res;
                })
                .catch(() => caches.match(e.request, { ignoreSearch: true }))
        );
        return;
    }

    // Cache-first para assets estáticos (CSS, JS, fontes, imagens)
    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then(cached => {
            const fetchPromise = fetch(e.request).then(res => {
                if (res.ok) {
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
                }
                return res;
            }).catch(() => cached || new Response('', { status: 503 }));

            return cached || fetchPromise;
        })
    );
});
