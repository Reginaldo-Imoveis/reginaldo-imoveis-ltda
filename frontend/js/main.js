// =========================================================
// REGINALDO IMÓVEIS — Main Script
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    initHeaderScroll();
    initMobileMenu();
    initNavDropdown();
    initMobileSearch();
    initReveal();
    initCounters();
    initSearch();
    initFilterChips();
    carregarImoveis();
    initCaptacaoInline();
    initAccordion();
});

function initMobileMenu() {
    const btn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav-links');
    if (!btn || !nav) return;

    const closeMenu = () => {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', () => {
        nav.classList.toggle('open');
        btn.setAttribute('aria-expanded', nav.classList.contains('open'));
    });

    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !nav.contains(e.target)) {
            closeMenu();
        }
    });
}

function initNavDropdown() {
    const trigger = document.querySelector('.nav-dropdown-trigger');
    const dropdown = document.querySelector('.nav-dropdown');
    if (!trigger || !dropdown) return;
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });
}

function initMobileSearch() {
    const toggle = document.getElementById('mobile-search-toggle');
    const searchBar = document.querySelector('.search-bar');
    if (!toggle || !searchBar) return;

    let justToggled = false;

    toggle.addEventListener('click', () => {
        justToggled = true;
        searchBar.classList.toggle('mobile-open');
        toggle.setAttribute('aria-expanded', searchBar.classList.contains('mobile-open'));
        setTimeout(() => { justToggled = false; }, 100);
    });

    document.addEventListener('click', (e) => {
        if (justToggled) return;
        if (!e.target.closest('#mobile-search-toggle') && !e.target.closest('.search-bar')) {
            searchBar.classList.remove('mobile-open');
        }
    });

    searchBar.querySelector('#btn-buscar')?.addEventListener('click', () => {
        searchBar.classList.remove('mobile-open');
    });
}

// COUNTER animation
function initCounters() {
    const counters = document.querySelectorAll('.counter[data-target]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const target = parseInt(el.dataset.target, 10);
            const duration = 1800;
            const frameDuration = 16;
            const totalFrames = Math.round(duration / frameDuration);
            let frame = 0;

            const timer = setInterval(() => {
                frame++;
                const progress = frame / totalFrames;
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.round(eased * target);
                if (frame >= totalFrames) {
                    el.textContent = target;
                    clearInterval(timer);
                }
            }, frameDuration);

            observer.unobserve(el);
        });
    }, { threshold: 0.5 });

    counters.forEach(c => observer.observe(c));
}

// HEADER scroll
function initHeaderScroll() {
    const header = document.getElementById('site-header');
    if (!header) return;
    const onScroll = () => {
        if (window.scrollY > 30) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

// REVEAL on scroll
function initReveal() {
    document.documentElement.classList.add('js-ready');
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.05, rootMargin: '0px 0px 200px 0px' });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// FILTROS por chip
let currentTipo = 'todos';
let currentBusca = '';
let currentFaixa = 'todos';
let imoveisLoadedCache = [];

function initFilterChips() {
    const chips = document.querySelectorAll('#filter-chips .chip');
    chips.forEach(c => {
        c.addEventListener('click', () => {
            chips.forEach(x => x.classList.remove('active'));
            c.classList.add('active');
            currentTipo = c.dataset.tipo;
            // Sincronizar com select do hero
            const sel = document.getElementById('search-tipo');
            if (sel) sel.value = currentTipo;
            carregarImoveis();
        });
    });
}

// SEARCH BAR
function initSearch() {
    const btn = document.getElementById('btn-buscar');
    const inputTexto = document.getElementById('search-texto');
    const selTipo = document.getElementById('search-tipo');
    const selFaixa = document.getElementById('search-faixa');

    const sync = () => {
        if (selTipo) currentTipo = selTipo.value;
        if (selFaixa) currentFaixa = selFaixa.value;
        if (inputTexto) currentBusca = inputTexto.value;

        // Sincronizar chips
        document.querySelectorAll('#filter-chips .chip').forEach(c => {
            c.classList.toggle('active', c.dataset.tipo === currentTipo);
        });

        carregarImoveis();
    };

    if (btn) {
        btn.addEventListener('click', () => {
            sync();
            document.getElementById('imoveis').scrollIntoView({ behavior: 'smooth' });
        });
    }

    let debounce;
    [inputTexto, selTipo, selFaixa].forEach(el => {
        if (!el) return;
        const ev = el.tagName === 'INPUT' ? 'input' : 'change';
        el.addEventListener(ev, () => {
            clearTimeout(debounce);
            debounce = setTimeout(sync, 300);
        });
    });
}

// CARREGAR IMÓVEIS
async function carregarImoveis() {
    const grid = document.getElementById('grid-imoveis');
    if (!grid) return;

    grid.innerHTML = Array.from({ length: 4 }, () => `
        <article class="imovel-card skeleton-card">
            <div class="skeleton-img"></div>
            <div class="imovel-info">
                <div class="skeleton-line" style="width:40%;height:12px;margin-bottom:10px"></div>
                <div class="skeleton-line" style="width:75%;height:18px;margin-bottom:14px"></div>
                <div class="skeleton-line" style="width:60%;height:12px;margin-bottom:20px"></div>
                <div class="skeleton-line" style="width:50%;height:22px"></div>
            </div>
        </article>
    `).join('');

    try {
        let url = `/api/imoveis?tipo=${encodeURIComponent(currentTipo)}`;
        if (currentBusca) url += `&busca=${encodeURIComponent(currentBusca)}`;

        const res = await fetch(url);
        const json = await res.json();
        let imoveis = Array.isArray(json) ? json : (json.data || []);
        imoveisLoadedCache = imoveis;

        // Filtro de faixa de preço (client-side)
        if (currentFaixa && currentFaixa !== 'todos') {
            const [min, max] = currentFaixa.split('-').map(Number);
            imoveis = imoveis.filter(i => i.preco >= min && i.preco <= max);
        }

        grid.innerHTML = '';
        imoveis = imoveis.slice(0, 6);

        if (!imoveis.length) {
            grid.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding: 60px 20px; color: var(--c-text-mute);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4; margin-bottom: 16px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <h4 style="font-family: var(--font-display); font-size: 1.5rem; color: var(--c-text); margin-bottom: 8px;">Nenhum imóvel encontrado</h4>
                    <p>Tente ajustar os filtros ou fale com um especialista para uma curadoria sob medida.</p>
                </div>
            `;
            return;
        }

        imoveis.forEach(imovel => grid.appendChild(criarCard(imovel)));
        atualizarBotoesFavoritos();
        initCarouselDots(grid, imoveis.length);
    } catch (err) {
        const isOffline = err instanceof TypeError && err.message.toLowerCase().includes('fetch');
        const msg = isOffline
            ? 'O servidor não está em execução. Inicie com <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:3px;">npm start</code> e atualize a página.'
            : 'Verifique sua conexão e tente novamente.';
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding: 60px 20px; color: var(--c-text-mute);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FF8B8B" stroke-width="1.5" style="margin-bottom: 16px;">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h4 style="font-family: var(--font-display); font-size: 1.5rem; color: var(--c-text); margin-bottom: 8px;">Não foi possível carregar os imóveis</h4>
                <p style="margin-bottom: 20px;">${msg}</p>
                <button onclick="carregarImoveis()" style="background: var(--c-gold); color: #000; border: none; padding: 12px 28px; border-radius: 4px; cursor: pointer; font-weight: 600;">Tentar novamente</button>
            </div>
        `;
    }
}

const SOCIAL_PROOF_TAGS = ['Alta procura', 'Novidade', 'Oportunidade', 'Exclusivo'];

function slugify(str) {
    return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function criarCard(imovel) {
    const preco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(imovel.preco);
    const finalidade = imovel.finalidade || 'Venda';
    const precoLabel = finalidade === 'Locação' ? 'Aluguel' : 'A partir de';
    const slug = imovel.slug || slugify(imovel.titulo);
    const detalhesUrl = `/imovel/${slug}-${imovel.id}`;

    let statusClass = '';
    if (imovel.status === 'Vendido') statusClass = 'vendido';
    if (imovel.status === 'Reservado') statusClass = 'reservado';
    const statusHtml = imovel.status && imovel.status !== 'Disponível'
        ? `<span class="badge-status ${statusClass}">${imovel.status}</span>` : '';

    const hash = (imovel.id * 2654435761) >>> 0;
    const showProof = imovel.status === 'Disponível' || !imovel.status;
    const proofTag = showProof && (hash % 3 === 0)
        ? `<span class="badge-proof">${SOCIAL_PROOF_TAGS[hash % SOCIAL_PROOF_TAGS.length]}</span>` : '';

    const imgUrl = imovel.imagem || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format';

    const card = document.createElement('article');
    card.className = 'imovel-card card-enter';
    card.innerHTML = `
        <div class="imovel-img-wrap">
            <span class="badge-tipo">${imovel.tipo}</span>
            <span class="badge-finalidade ${finalidade === 'Locação' ? 'locacao' : 'venda'}">${finalidade}</span>
            ${statusHtml}
            ${proofTag}
            <button class="btn-fav" title="Adicionar aos favoritos" aria-label="Adicionar aos favoritos" onclick="toggleFavorito(event, ${imovel.id})">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <a href="${detalhesUrl}" style="display:block; width:100%; height:100%;">
                <img class="imovel-img" src="${imgUrl}" alt="${imovel.titulo}" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format'">
            </a>
        </div>
        <div class="imovel-info">
            <div class="imovel-loc">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                São Paulo / SP
            </div>
            <h3 class="imovel-titulo"><a href="${detalhesUrl}">${imovel.titulo}</a></h3>
            <div class="imovel-features">
                ${imovel.quartos > 0 ? `<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>${imovel.quartos} Dorms</span>` : ''}
                ${imovel.vagas > 0 ? `<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><path d="M5 11l2-7h10l2 7"/></svg>${imovel.vagas} Vagas</span>` : ''}
                ${imovel.areaUtil > 0 ? `<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 12h16"/><path d="M12 4v16"/></svg>${imovel.areaUtil}m²</span>` : ''}
            </div>
            <div class="imovel-footer">
                <div class="imovel-preco-wrap">
                    <span class="label">${precoLabel}</span>
                    <div class="imovel-preco">${preco}</div>
                </div>
                <a href="${detalhesUrl}" class="card-arrow" aria-label="Ver detalhes">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
            </div>
        </div>
    `;
    return card;
}

// ===== FAVORITOS (com cache offline) =====
function getFavoritos() {
    try {
        const favs = localStorage.getItem('reginaldo_favoritos');
        return favs ? JSON.parse(favs) : [];
    } catch { return []; }
}

function getFavoritosData() {
    try {
        const data = localStorage.getItem('reginaldo_favoritos_data');
        return data ? JSON.parse(data) : {};
    } catch { return {}; }
}

function saveFavoritoData(id, imovel) {
    const data = getFavoritosData();
    data[id] = {
        id: imovel.id,
        titulo: imovel.titulo,
        tipo: imovel.tipo,
        preco: imovel.preco,
        quartos: imovel.quartos,
        vagas: imovel.vagas,
        areaUtil: imovel.areaUtil,
        imagem: imovel.imagem,
        finalidade: imovel.finalidade,
        status: imovel.status,
        slug: imovel.slug,
        cachedAt: Date.now()
    };
    localStorage.setItem('reginaldo_favoritos_data', JSON.stringify(data));

    if ('caches' in window && imovel.imagem) {
        caches.open('ri-images-v1').then(cache => {
            cache.add(imovel.imagem).catch(() => {});
        });
    }
}

function removeFavoritoData(id) {
    const data = getFavoritosData();
    delete data[id];
    localStorage.setItem('reginaldo_favoritos_data', JSON.stringify(data));
}

function toggleFavorito(event, id) {
    event.preventDefault();
    event.stopPropagation();

    let favs = getFavoritos();
    const btn = event.currentTarget;

    if (favs.includes(id)) {
        favs = favs.filter(f => f !== id);
        btn.classList.remove('active');
        removeFavoritoData(id);
    } else {
        favs.push(id);
        btn.classList.add('active');
        const imovelData = imoveisLoadedCache.find(i => i.id === id);
        if (imovelData) saveFavoritoData(id, imovelData);
    }
    localStorage.setItem('reginaldo_favoritos', JSON.stringify(favs));
}

function atualizarBotoesFavoritos() {
    const favs = getFavoritos();
    document.querySelectorAll('.btn-favoritar, .btn-fav').forEach(btn => {
        const m = (btn.getAttribute('onclick') || '').match(/toggleFavorito\(event,\s*(\d+)\)/);
        if (m && m[1]) {
            const id = parseInt(m[1], 10);
            btn.classList.toggle('active', favs.includes(id));
        }
    });
}

// ===== CAPTAÇÃO INLINE =====
function initCaptacaoInline() {
    const form = document.getElementById('captacao-form-inline');
    if (!form) return;

    const API_URL = '/api/leads';

    const rangeInput = document.getElementById('cap-preco');
    const precoDisplay = document.getElementById('cap-preco-display');
    const btnSubmit = document.getElementById('cap-btn-submit-inline');
    const btnText = document.getElementById('cap-btn-text-inline');
    const btnSpinner = document.getElementById('cap-btn-spinner-inline');
    const successEl = document.getElementById('cap-success-inline');

    function formatBRL(val) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency', currency: 'BRL', minimumFractionDigits: 0
        }).format(val);
    }

    function updateSliderFill() {
        const min = Number(rangeInput.min);
        const max = Number(rangeInput.max);
        const val = Number(rangeInput.value);
        const pct = ((val - min) / (max - min)) * 100;
        rangeInput.style.background =
            `linear-gradient(to right, #7B1929 0%, #C4A26B ${pct}%, #242430 ${pct}%, #242430 100%)`;
        precoDisplay.textContent = formatBRL(val);
    }

    rangeInput.addEventListener('input', updateSliderFill);
    updateSliderFill();

    document.getElementById('cap-telefone').addEventListener('input', function () {
        let v = this.value.replace(/\D/g, '').slice(0, 11);
        if (v.length >= 7) {
            v = '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
        } else if (v.length >= 3) {
            v = '(' + v.slice(0,2) + ') ' + v.slice(2);
        } else if (v.length >= 1) {
            v = '(' + v;
        }
        this.value = v;
    });

    const BTN_DEFAULT_TEXT = 'Receber imóveis exclusivos';

    function setLoading(loading) {
        btnSubmit.disabled = loading;
        btnText.textContent = loading ? 'Enviando…' : BTN_DEFAULT_TEXT;
        btnSpinner.style.display = loading ? 'block' : 'none';
    }

    function showFormError(msg) {
        let errEl = form.querySelector('.cap-form-error-msg');
        if (!errEl) {
            errEl = document.createElement('p');
            errEl.className = 'cap-form-error-msg';
            errEl.style.cssText = 'text-align:center;font-size:0.875rem;color:#FF8B8B;margin-top:12px;margin-bottom:0;font-weight:500;';
            btnSubmit.parentNode.insertBefore(errEl, btnSubmit);
        }
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }

    function hideFormError() {
        const errEl = form.querySelector('.cap-form-error-msg');
        if (errEl) errEl.style.display = 'none';
    }

    function showSuccess() {
        successEl.classList.add('visible');
        btnSubmit.style.display = 'none';
    }

    function resetForm() {
        form.reset();
        updateSliderFill();
        hideFormError();
        successEl.classList.remove('visible');
        btnSubmit.style.display = 'flex';
        setLoading(false);
    }

    document.getElementById('cap-btn-nova')?.addEventListener('click', resetForm);

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const nome = document.getElementById('cap-nome').value.trim();
        const telefone = document.getElementById('cap-telefone').value.trim();
        const tipo = document.getElementById('cap-tipo').value;

        if (!nome || !telefone || !tipo) {
            showFormError('Por favor, preencha Nome, Telefone e Tipo de imóvel.');
            return;
        }
        hideFormError();

        const quartos = document.querySelector('input[name="cap-quartos"]:checked')?.value || 'Não informado';
        const vagas = document.querySelector('input[name="cap-vagas"]:checked')?.value || 'Não informado';
        const faixaPreco = rangeInput.value;

        setLoading(true);

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome, telefone,
                    tipo_imovel: tipo,
                    quartos, vagas,
                    faixa_preco: faixaPreco,
                    website: document.getElementById('cap-website')?.value || '',
                    origem: window.location.pathname,
                    utm_source: window.riTracker?.utm?.source || '',
                    session_id: window.riTracker?.sessionId || ''
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setLoading(false);
            showSuccess();
        } catch (err) {
            setLoading(false);
            showFormError('Não foi possível enviar. Tente novamente ou fale pelo WhatsApp.');
        }
    });
}

// ===== CAROUSEL DOTS =====
function initCarouselDots(grid, count) {
    const container = document.getElementById('carousel-dots');
    if (!container) return;
    container.innerHTML = '';
    if (count <= 1) return;

    const dots = Array.from({ length: count }, (_, i) => {
        const dot = document.createElement('button');
        dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', `Imóvel ${i + 1}`);
        dot.addEventListener('click', () => {
            const card = grid.children[i];
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
        container.appendChild(dot);
        return dot;
    });

    let scrollTimer;
    grid.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const cardWidth = grid.firstElementChild?.offsetWidth || 1;
            const activeIndex = Math.round(grid.scrollLeft / (cardWidth + 16));
            dots.forEach((dot, i) => dot.classList.toggle('active', i === activeIndex));
        }, 50);
    }, { passive: true });
}

// ===== ACCORDION =====
function initAccordion() {
    const triggers = document.querySelectorAll('.accordion-trigger');
    if (!triggers.length) return;

    triggers.forEach(trigger => {
        const panel = trigger.nextElementSibling;
        if (trigger.getAttribute('aria-expanded') === 'true') {
            panel.style.maxHeight = panel.scrollHeight + 'px';
        }

        trigger.addEventListener('click', () => {
            const isOpen = trigger.getAttribute('aria-expanded') === 'true';

            triggers.forEach(t => {
                t.setAttribute('aria-expanded', 'false');
                t.nextElementSibling.style.maxHeight = null;
            });

            if (!isOpen) {
                trigger.setAttribute('aria-expanded', 'true');
                panel.style.maxHeight = panel.scrollHeight + 'px';
            }
        });
    });
}
