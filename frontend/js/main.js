// =========================================================
// REGINALDO IMÓVEIS — Main Script v12 (Firebase)
// =========================================================

import { db } from './firebase-config.js';
import {
    collection, getDocs, addDoc, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const HIGH_TICKET_THRESHOLD = 1500000; // R$1,5M

document.addEventListener('DOMContentLoaded', () => {
    initHeaderScroll();
    initMobileMenu();
    initMobileSearch();
    initReveal();
    initCounters();
    initSearch();
    initFilterChips();
    carregarImoveis();
    initCaptacaoInline();
    initAccordion();
    initScrollTop();
    initSearchClear();
});

function initMobileMenu() {
    const btn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav-links');
    if (!btn || !nav) return;

    // Define estado inicial para screen readers
    btn.setAttribute('aria-expanded', 'false');

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

// COUNTER animation — uses requestAnimationFrame for frame-perfect sync
// Previously used setInterval(16ms) which drifts and causes microjank
function initCounters() {
    const counters = document.querySelectorAll('.counter[data-target]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const target = parseInt(el.dataset.target, 10);
            const duration = 1800;
            const startTime = performance.now();

            function tick(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.round(eased * target);
                if (progress < 1) {
                    requestAnimationFrame(tick);
                } else {
                    el.textContent = target;
                }
            }
            requestAnimationFrame(tick);
            observer.unobserve(el);
        });
    }, { threshold: 0.5 });

    counters.forEach(c => observer.observe(c));
}

// HEADER scroll — RAF-throttled to avoid triggering layout on every scroll event
function initHeaderScroll() {
    const header = document.getElementById('site-header');
    if (!header) return;
    let ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            header.classList.toggle('scrolled', window.scrollY > 30);
            ticking = false;
        });
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
let currentTipo       = 'todos';
let currentFinalidade = 'todos';
let currentBusca      = '';
let currentFaixa      = 'todos';
let imoveisLoadedCache = [];

function initFilterChips() {
    // Chips de tipo
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

    // Chips de finalidade (Venda / Aluguel)
    const chipsF = document.querySelectorAll('#filter-chips-finalidade .chip-finalidade');
    chipsF.forEach(c => {
        c.addEventListener('click', () => {
            chipsF.forEach(x => x.classList.remove('active'));
            c.classList.add('active');
            currentFinalidade = c.dataset.finalidade;
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

// CARREGAR IMÓVEIS (Firestore)
const PAGE_SIZE = 6;
let shownCount = 0;

// Cache de todos os imóveis buscados do Firestore (sem filtro)
let _allImoveisFirestore = null;
let _firebaseLoading     = false;

async function carregarImoveis() {
    const grid = document.getElementById('grid-imoveis');
    if (!grid) return;
    shownCount = 0;
    atualizarBotaoVerMais(0, 0);

    const buscarBtn = document.getElementById('btn-buscar');
    buscarBtn?.classList.add('loading');

    grid.innerHTML = Array.from({ length: 6 }, () => `
        <article class="imovel-card skeleton-card">
            <div class="imovel-img-wrap"></div>
            <div class="imovel-info">
                <div class="skeleton-line" style="width:38%;height:11px;margin-bottom:10px"></div>
                <div class="skeleton-line" style="width:78%;height:20px;margin-bottom:12px"></div>
                <div class="skeleton-line" style="width:62%;height:11px;margin-bottom:20px"></div>
                <div class="skeleton-line" style="width:52%;height:24px"></div>
            </div>
        </article>
    `).join('');

    try {
        // Busca todos do Firestore uma vez e faz cache em memória
        if (!_allImoveisFirestore) {
            const q        = query(collection(db, 'imoveis'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            _allImoveisFirestore = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        // Filtragem client-side
        let imoveis = _allImoveisFirestore;

        if (currentTipo && currentTipo !== 'todos') {
            imoveis = imoveis.filter(i => (i.tipo || '').toLowerCase() === currentTipo.toLowerCase());
        }
        if (currentFinalidade && currentFinalidade !== 'todos') {
            // Imóveis híbridos ("Venda e Locação") aparecem nos dois filtros
            imoveis = imoveis.filter(i => {
                const f = i.finalidade || 'Venda';
                if (currentFinalidade === 'Venda')   return f === 'Venda'   || f === 'Venda e Locação';
                if (currentFinalidade === 'Locação') return f === 'Locação' || f === 'Venda e Locação';
                return f === currentFinalidade;
            });
        }
        if (currentBusca) {
            const term = currentBusca.toLowerCase();
            imoveis = imoveis.filter(i =>
                (i.titulo    || '').toLowerCase().includes(term) ||
                (i.descricao || '').toLowerCase().includes(term) ||
                (i.bairro    || '').toLowerCase().includes(term)
            );
        }
        if (currentFaixa && currentFaixa !== 'todos') {
            const [min, max] = currentFaixa.split('-').map(Number);
            if (!isNaN(min)) imoveis = imoveis.filter(i => (i.preco || 0) >= min);
            if (!isNaN(max)) imoveis = imoveis.filter(i => (i.preco || 0) <= max);
        }

        imoveisLoadedCache = imoveis;
        buscarBtn?.classList.remove('loading');
        grid.innerHTML = '';

        if (!imoveis.length) {
            grid.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding: 60px 20px; color: var(--c-text-mute);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4; margin-bottom: 16px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <h4 style="font-family: var(--font-display); font-size: 1.5rem; color: var(--c-text); margin-bottom: 8px;">Nenhum imóvel encontrado</h4>
                    <p>Tente ajustar os filtros ou fale com um especialista para uma curadoria sob medida.</p>
                </div>`;
            atualizarBotaoVerMais(0, 0);
            return;
        }

        const batch = imoveis.slice(0, PAGE_SIZE);
        shownCount  = batch.length;
        batch.forEach(imovel => grid.appendChild(criarCard(imovel)));
        atualizarBotoesFavoritos();
        initCarouselDots(grid, shownCount);
        atualizarBotaoVerMais(shownCount, imoveis.length);

    } catch (err) {
        buscarBtn?.classList.remove('loading');
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding: 60px 20px; color: var(--c-text-mute);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FF8B8B" stroke-width="1.5" style="margin-bottom: 16px;">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h4 style="font-family: var(--font-display); font-size: 1.5rem; color: var(--c-text); margin-bottom: 8px;">Não foi possível carregar os imóveis</h4>
                <p style="margin-bottom: 20px;">Verifique sua conexão e tente novamente.</p>
                <button onclick="window.carregarImoveis()" style="background: var(--c-gold); color: #000; border: none; padding: 12px 28px; border-radius: 4px; cursor: pointer; font-weight: 600;">Tentar novamente</button>
            </div>`;
    }
}

// Expor para o onclick do HTML
window.carregarImoveis = carregarImoveis;

function atualizarBotaoVerMais(shown, total) {
    const btn = document.getElementById('btn-ver-mais');
    if (!btn) return;
    if (shown >= total || total === 0) {
        btn.style.display = 'none';
    } else {
        btn.style.display = 'inline-flex';
        btn.textContent = `Ver mais imóveis (${total - shown} restantes)`;
    }
}

function carregarMais() {
    const grid = document.getElementById('grid-imoveis');
    if (!grid || !imoveisLoadedCache.length) return;
    const proximos = imoveisLoadedCache.slice(shownCount, shownCount + PAGE_SIZE);
    proximos.forEach(imovel => grid.appendChild(criarCard(imovel)));
    shownCount += proximos.length;
    atualizarBotoesFavoritos();
    initCarouselDots(grid, shownCount);
    atualizarBotaoVerMais(shownCount, imoveisLoadedCache.length);
}

const SOCIAL_PROOF_TAGS = ['Alta procura', 'Novidade', 'Oportunidade', 'Exclusivo'];

function slugify(str) {
    return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function criarCard(imovel) {
    const preco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(imovel.preco);
    const finalidade = imovel.finalidade || 'Venda';
    const isHibrido  = finalidade === 'Venda e Locação';
    const precoLabel = finalidade === 'Locação' ? 'Aluguel' : isHibrido ? 'Venda / Locação' : 'A partir de';
    // GitHub Pages (estático): usa query param em vez de rota no servidor
    const detalhesUrl = `detalhes.html?id=${imovel.id}`;

    let statusClass = '';
    if (imovel.status === 'Vendido')   statusClass = 'vendido';
    if (imovel.status === 'Alugado')   statusClass = 'alugado';
    if (imovel.status === 'Reservado') statusClass = 'reservado';
    const statusHtml = imovel.status && imovel.status !== 'Disponível'
        ? `<span class="badge-status ${statusClass}">${imovel.status}</span>` : '';

    // Hash estável a partir do ID (string Firestore): converte char codes em número
    const hash = Array.from(String(imovel.id)).reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 2654435761)) >>> 0, 0);
    const showProof = imovel.status === 'Disponível' || !imovel.status;
    const proofTag = showProof && (hash % 3 === 0)
        ? `<span class="badge-proof">${SOCIAL_PROOF_TAGS[hash % SOCIAL_PROOF_TAGS.length]}</span>` : '';

    const imgUrl = imovel.imagem
        || (Array.isArray(imovel.galeria) && imovel.galeria[0])
        || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format';

    const card = document.createElement('article');
    card.className = 'imovel-card card-enter';
    card.innerHTML = `
        <div class="imovel-img-wrap">
            <span class="badge-tipo">${imovel.tipo}</span>
            <span class="badge-finalidade ${isHibrido ? 'hibrido' : finalidade === 'Locação' ? 'locacao' : 'venda'}">${isHibrido ? 'Venda + Locação' : finalidade}</span>
            ${statusHtml}
            ${proofTag}
            <button class="btn-fav" title="Adicionar aos favoritos" aria-label="Adicionar aos favoritos" onclick="toggleFavorito(event, '${imovel.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <a href="${detalhesUrl}" style="display:block; width:100%; height:100%;">
                <img class="imovel-img lazy-blur" src="${imgUrl}" alt="${imovel.titulo}" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format';this.classList.add('loaded')">
            </a>
        </div>
        <div class="imovel-info">
            <div class="imovel-loc">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${imovel.bairro ? imovel.bairro + ' · ' : ''}São Paulo / SP
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

    // Blur-up: add 'loaded' class when image is ready
    const img = card.querySelector('.lazy-blur');
    if (img) {
        if (img.complete && img.naturalWidth) {
            img.classList.add('loaded');
        } else {
            img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
            img.addEventListener('error', () => img.classList.add('loaded'), { once: true });
        }
    }

    return card;
}

// Expor para o onclick do HTML
window.carregarMais = carregarMais;

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
        btn.classList.remove('just-favorited');
        void btn.offsetWidth; // força reflow para reiniciar a animação
        btn.classList.add('just-favorited');
        setTimeout(() => btn.classList.remove('just-favorited'), 600);
        const imovelData = imoveisLoadedCache.find(i => i.id === id);
        if (imovelData) saveFavoritoData(id, imovelData);
    }
    localStorage.setItem('reginaldo_favoritos', JSON.stringify(favs));
}

// Expor para o onclick gerado dinamicamente nos cards
window.toggleFavorito = toggleFavorito;

function atualizarBotoesFavoritos() {
    const favs = getFavoritos();
    document.querySelectorAll('.btn-favoritar, .btn-fav').forEach(btn => {
        // ID pode ser string Firestore — captura qualquer coisa dentro das aspas simples
        const m = (btn.getAttribute('onclick') || '').match(/toggleFavorito\(event,\s*'([^']+)'\)/);
        if (m && m[1]) {
            btn.classList.toggle('active', favs.includes(m[1]));
        }
    });
}

// ===== CAPTAÇÃO INLINE (Firestore) =====
function initCaptacaoInline() {
    const form = document.getElementById('captacao-form-inline');
    if (!form) return;

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

        // Honeypot: se o campo oculto foi preenchido, é bot
        if (document.getElementById('cap-website')?.value) {
            setLoading(false);
            showSuccess(); // silencioso para bots
            return;
        }

        try {
            const faixaNum = parseFloat(faixaPreco) || 0;
            await addDoc(collection(db, 'leads'), {
                nome,
                telefone,
                tipo_imovel:  tipo,
                quartos,
                vagas,
                faixa_preco:  faixaNum,
                classificacao: faixaNum >= HIGH_TICKET_THRESHOLD ? 'High Ticket' : 'Normal',
                status:       'novo',
                origem:       window.location.pathname,
                utm_source:   window.riTracker?.utm?.source || '',
                session_id:   window.riTracker?.sessionId  || '',
                criado_em:    serverTimestamp()
            });
            setLoading(false);
            showSuccess();
        } catch (err) {
            setLoading(false);
            showFormError('Não foi possível enviar. Tente novamente ou fale pelo WhatsApp.');
        }
    });
}

// ===== CAROUSEL DOTS =====
// Memory leak fix: store cleanup function so the old scroll listener
// is removed before a new one is added (happens on every carregarImoveis call)
let _carouselScrollOff = null;

function initCarouselDots(grid, count) {
    const container = document.getElementById('carousel-dots');
    if (!container) return;

    // Remove previous scroll listener to prevent accumulation (was a real leak)
    if (_carouselScrollOff) {
        _carouselScrollOff();
        _carouselScrollOff = null;
    }

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
    const onScroll = () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const cardWidth = grid.firstElementChild?.offsetWidth || 1;
            const activeIndex = Math.round(grid.scrollLeft / (cardWidth + 16));
            dots.forEach((dot, i) => dot.classList.toggle('active', i === activeIndex));
        }, 50);
    };

    grid.addEventListener('scroll', onScroll, { passive: true });
    // Store cleanup so next call can remove this listener
    _carouselScrollOff = () => grid.removeEventListener('scroll', onScroll);
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

// ===== SCROLL TO TOP — RAF-throttled =====
function initScrollTop() {
    const btn = document.createElement('button');
    btn.className = 'btn-scroll-top';
    btn.setAttribute('aria-label', 'Voltar ao topo');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
    document.body.appendChild(btn);

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            btn.classList.toggle('visible', window.scrollY > 500);
            ticking = false;
        });
    }, { passive: true });

    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ===== SEARCH CLEAR BUTTON =====
function initSearchClear() {
    const input = document.getElementById('search-texto');
    if (!input) return;

    const field = input.closest('.field');
    if (!field) return;
    field.style.position = 'relative';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'search-clear-btn';
    clearBtn.setAttribute('aria-label', 'Limpar busca');
    clearBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    field.appendChild(clearBtn);

    const toggle = () => clearBtn.classList.toggle('visible', input.value.length > 0);
    input.addEventListener('input', toggle);

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.remove('visible');
        currentBusca = '';
        carregarImoveis();
        input.focus();
    });
}
