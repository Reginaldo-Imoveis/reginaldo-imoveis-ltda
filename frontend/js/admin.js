// =========================================================
// REGINALDO IMÓVEIS — Admin Script v10 (Firebase)
// =========================================================

import { db, auth, storage } from './firebase-config.js';

import {
    collection, getDocs, addDoc, updateDoc, deleteDoc,
    doc, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import {
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import {
    ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

// ── Constantes ──────────────────────────────────────────────
const HIGH_TICKET_THRESHOLD = 1500000; // R$1,5M — igual ao backend

let imoveisCache = [];
let editandoId   = null; // Firestore doc ID (string)
let leadsCache   = [];

// ── Util ────────────────────────────────────────────────────
function escHtml(str) {
    if (str === null || str === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

function generateSlug(str) {
    return (str || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── DOMContentLoaded ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    initLogout();
    initModal();
    initConfirmDelete();
    initForm();
    initSearchAndFilter();
    initTabelaActions();
    initLeadsView();
    initSidebarNav();
    document.getElementById('analytics-periodo')?.addEventListener('change', renderAnalytics);
});

// ============================================================
//  AUTH — Firebase Auth (email + senha)
// ============================================================
onAuthStateChanged(auth, user => {
    if (user) {
        showPanel();
    } else {
        showLoginScreen();
    }
});

function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-panel').style.display  = 'none';
}

function showPanel() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display  = 'block';
    carregarImoveisAdmin();
}

// ── LOGIN ────────────────────────────────────────────────────
function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('admin-email');
        const senhaEl = document.getElementById('admin-password');
        const errEl   = document.getElementById('login-error');
        const btn     = form.querySelector('button[type="submit"]');

        const email = emailEl?.value?.trim() || '';
        const senha = senhaEl.value;

        btn.disabled = true;
        btn.textContent = 'Entrando…';
        errEl.classList.remove('show');
        errEl.style.color = '';

        try {
            await signInWithEmailAndPassword(auth, email, senha);
            // onAuthStateChanged dispara showPanel() automaticamente
        } catch (err) {
            const msgs = {
                'auth/invalid-email':       'E-mail inválido.',
                'auth/user-not-found':      'Usuário não encontrado.',
                'auth/wrong-password':      'Senha incorreta.',
                'auth/invalid-credential':  'Credenciais inválidas.',
                'auth/too-many-requests':   'Muitas tentativas. Aguarde alguns minutos.'
            };
            errEl.textContent = msgs[err.code] || 'Erro de autenticação. Verifique os dados.';
            errEl.classList.add('show');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Entrar no painel <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
        }
    });
}

// ── LOGOUT ───────────────────────────────────────────────────
function initLogout() {
    const btn = document.getElementById('btn-logout');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        await signOut(auth);
        // onAuthStateChanged dispara showLoginScreen() automaticamente
    });
}

// ============================================================
//  SIDEBAR NAV
// ============================================================
function initSidebarNav() {
    document.querySelector('[data-view="imoveis"]')
        ?.addEventListener('click', e => { e.preventDefault(); switchView('imoveis'); });

    document.getElementById('link-analytics')
        ?.addEventListener('click', e => { e.preventDefault(); switchView('analytics'); });

    // 2FA / Segurança removido — Firebase Auth gerencia auth
    const linkSeg = document.getElementById('link-seguranca');
    if (linkSeg) linkSeg.style.display = 'none';
}

const EXTRA_VIEWS = ['view-leads', 'view-seguranca', 'view-analytics'];

function switchView(view) {
    document.querySelectorAll('.admin-menu a[data-view]')
        .forEach(a => a.classList.remove('active'));

    const mainEl = document.querySelector('.admin-main');
    if (mainEl) {
        Array.from(mainEl.children).forEach(child => {
            if (!EXTRA_VIEWS.includes(child.id)) {
                child.style.display = (view === 'imoveis' || !view) ? '' : 'none';
            }
        });
    }

    EXTRA_VIEWS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (view === 'leads') {
        document.getElementById('view-leads').style.display = 'block';
        document.querySelector('[data-view="leads"]')?.classList.add('active');
        carregarLeads();
    } else if (view === 'analytics') {
        document.getElementById('view-analytics').style.display = 'block';
        document.querySelector('[data-view="analytics"]')?.classList.add('active');
        renderAnalytics();
    } else {
        document.querySelector('[data-view="imoveis"]')?.classList.add('active');
    }
}

// ============================================================
//  LISTA DE IMÓVEIS (Firestore)
// ============================================================
async function carregarImoveisAdmin() {
    const tbody = document.getElementById('tbody-imoveis');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--c-text-mute); padding: 40px;">Carregando imóveis…</td></tr>`;

    try {
        const q        = query(collection(db, 'imoveis'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        imoveisCache   = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTabela();
        renderStats();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#FF8B8B; padding: 40px;">Erro ao carregar: ${escHtml(err.message)}</td></tr>`;
    }
}

function renderTabela() {
    const tbody       = document.getElementById('tbody-imoveis');
    const count       = document.getElementById('count-imoveis');
    const busca       = document.getElementById('admin-search-input').value.trim().toLowerCase();
    const statusFiltro = document.getElementById('admin-filter-status').value;

    let lista = imoveisCache;

    if (busca) {
        lista = lista.filter(i =>
            (i.titulo    || '').toLowerCase().includes(busca) ||
            (i.tipo      || '').toLowerCase().includes(busca) ||
            (i.descricao || '').toLowerCase().includes(busca)
        );
    }
    if (statusFiltro && statusFiltro !== 'todos') {
        lista = lista.filter(i => i.status === statusFiltro);
    }

    count.textContent = lista.length;

    if (!lista.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    </svg>
                    <h4>Nenhum imóvel encontrado</h4>
                    <p>Cadastre um novo imóvel para começar.</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(i => {
        const preco       = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(i.preco || 0);
        const statusClass = (i.status || 'Disponível').toLowerCase()
            .replace(/[áàâã]/g,'a').replace(/[éê]/g,'e').replace(/[íî]/g,'i').replace(/\s+/g,'-');
        const img         = escHtml(i.imagem) || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=200&auto=format';

        return `
            <tr data-id="${escHtml(i.id)}">
                <td><img class="imovel-row-img" src="${img}" alt="${escHtml(i.titulo)}"></td>
                <td>
                    <div class="row-titulo">${escHtml(i.titulo)}</div>
                    <div class="row-tipo">${escHtml(i.tipo)} · ${escHtml(i.finalidade || 'Venda')}</div>
                </td>
                <td><span class="status-pill ${escHtml(statusClass)}">${escHtml(i.status || 'Disponível')}</span></td>
                <td style="color: var(--c-text-soft); font-size: 0.88rem;">
                    ${i.quartos > 0 ? parseInt(i.quartos) + ' dorms · ' : ''}${i.vagas > 0 ? parseInt(i.vagas) + ' vagas · ' : ''}${i.areaUtil > 0 ? parseFloat(i.areaUtil) + 'm²' : '—'}
                </td>
                <td><div class="row-preco">${preco}</div></td>
                <td>
                    <div class="row-actions">
                        <a class="btn-action" href="detalhes.html?id=${escHtml(i.id)}" target="_blank" rel="noopener noreferrer" title="Ver no site">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </a>
                        <button class="btn-action" data-action="editar" data-id="${escHtml(i.id)}" title="Editar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-action del" data-action="excluir" data-id="${escHtml(i.id)}" title="Excluir">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function renderStats() {
    const total = imoveisCache.length;
    const disp  = imoveisCache.filter(i => i.status === 'Disponível' || !i.status).length;
    const vend  = imoveisCache.filter(i => i.status === 'Vendido').length;
    const valor = imoveisCache
        .filter(i => i.status === 'Disponível' || !i.status)
        .reduce((s, i) => s + (parseFloat(i.preco) || 0), 0);

    document.getElementById('stat-total').textContent    = total;
    document.getElementById('stat-disponivel').textContent = disp;
    document.getElementById('stat-vendido').textContent  = vend;
    document.getElementById('stat-valor').textContent    = new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1
    }).format(valor);
}

function initSearchAndFilter() {
    document.getElementById('admin-search-input')?.addEventListener('input', renderTabela);
    document.getElementById('admin-filter-status')?.addEventListener('change', renderTabela);
}

function initTabelaActions() {
    const tbody = document.getElementById('tbody-imoveis');
    if (!tbody) return;
    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id     = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'editar')  abrirEdicao(id);
        if (action === 'excluir') confirmarExclusao(id);
    });
}

// ============================================================
//  MODAL DE IMÓVEL
// ============================================================
function initModal() {
    const overlay = document.getElementById('modal-imovel');

    document.getElementById('btn-novo')?.addEventListener('click', abrirNovo);
    document.getElementById('link-novo')?.addEventListener('click', e => { e.preventDefault(); abrirNovo(); });
    document.getElementById('btn-modal-close')?.addEventListener('click', fecharModal);
    document.getElementById('btn-cancel')?.addEventListener('click', fecharModal);
    overlay?.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });

    // Preview imagem de destaque
    document.getElementById('imagem')?.addEventListener('change', e => {
        const f       = e.target.files[0];
        const preview = document.getElementById('preview-imagem');
        if (f) {
            const reader = new FileReader();
            reader.onload = ev => { preview.src = ev.target.result; preview.classList.add('show'); };
            reader.readAsDataURL(f);
        } else {
            preview.classList.remove('show');
        }
    });

    // Preview galeria
    document.getElementById('galeria')?.addEventListener('change', e => {
        const container = document.getElementById('preview-galeria');
        container.innerHTML = '';
        Array.from(e.target.files).forEach((f, i) => {
            const reader = new FileReader();
            reader.onload = ev => {
                const thumb = document.createElement('div');
                thumb.className = 'galeria-thumb';
                thumb.innerHTML = `<img src="${ev.target.result}" alt="Foto ${i + 1}">`;
                container.appendChild(thumb);
            };
            reader.readAsDataURL(f);
        });
    });

    document.getElementById('btn-confirm-cancel')?.addEventListener('click', fecharConfirm);
    document.getElementById('modal-confirm')?.addEventListener('click', e => {
        if (e.target.id === 'modal-confirm') fecharConfirm();
    });
}

function abrirNovo() {
    editandoId = null;
    document.getElementById('modal-title').innerHTML = 'Novo <em style="font-style:italic;font-family:var(--font-serif);color:var(--c-gold);">imóvel</em>';
    document.getElementById('imovel-form').reset();
    document.getElementById('imovel-id').value = '';
    document.getElementById('preview-imagem').classList.remove('show');
    document.getElementById('preview-galeria').innerHTML = '';
    document.getElementById('mapa_url').value = '';
    document.getElementById('form-msg').classList.remove('show', 'ok', 'err');
    document.getElementById('modal-imovel').classList.add('open');
}

window.abrirEdicao = function(id) {
    const imovel = imoveisCache.find(i => i.id === id);
    if (!imovel) return;

    editandoId = id;
    document.getElementById('modal-title').innerHTML = 'Editar <em style="font-style:italic;font-family:var(--font-serif);color:var(--c-gold);">imóvel</em>';
    document.getElementById('imovel-id').value        = id;
    document.getElementById('titulo').value           = imovel.titulo    || '';
    document.getElementById('tipo').value             = imovel.tipo      || 'Apartamento';
    document.getElementById('finalidade').value       = imovel.finalidade || 'Venda';
    document.getElementById('status').value           = imovel.status    || 'Disponível';
    document.getElementById('preco').value            = imovel.preco     || '';
    document.getElementById('descricao').value        = imovel.descricao || '';
    document.getElementById('quartos').value          = imovel.quartos   || 0;
    document.getElementById('suites').value           = imovel.suites    || 0;
    document.getElementById('vagas').value            = imovel.vagas     || 0;
    document.getElementById('areaUtil').value         = imovel.areaUtil  || 0;
    document.getElementById('areaTotal').value        = imovel.areaTotal || 0;
    document.getElementById('mapa_url').value         = imovel.mapa_url  || '';
    document.getElementById('bairro').value           = imovel.bairro    || '';
    document.getElementById('imagem').value           = '';
    document.getElementById('galeria').value          = '';

    const preview = document.getElementById('preview-imagem');
    if (imovel.imagem) { preview.src = imovel.imagem; preview.classList.add('show'); }
    else { preview.classList.remove('show'); }

    const galeriaContainer = document.getElementById('preview-galeria');
    galeriaContainer.innerHTML = '';
    const fotos = Array.isArray(imovel.galeria) ? imovel.galeria : [];
    fotos.forEach(src => {
        const thumb = document.createElement('div');
        thumb.className = 'galeria-thumb';
        thumb.innerHTML = `<img src="${src}" alt="Foto galeria">`;
        galeriaContainer.appendChild(thumb);
    });

    document.getElementById('form-msg').classList.remove('show', 'ok', 'err');
    document.getElementById('modal-imovel').classList.add('open');
};

function fecharModal() {
    document.getElementById('modal-imovel').classList.remove('open');
}

// ============================================================
//  UPLOAD PARA FIREBASE STORAGE
// ============================================================
async function uploadFile(file, path) {
    const storageRef = ref(storage, path);
    const snap       = await uploadBytes(storageRef, file);
    return await getDownloadURL(snap.ref);
}

// ============================================================
//  FORM SUBMIT (Firestore + Storage)
// ============================================================
function initForm() {
    document.getElementById('imovel-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn          = document.getElementById('btn-salvar');
        const msg          = document.getElementById('form-msg');
        const id           = document.getElementById('imovel-id').value;
        const labelOriginal = btn.innerHTML;

        btn.disabled = true;
        msg.classList.remove('show', 'ok', 'err');

        try {
            // ── Campos de texto ──────────────────────────────────────
            const titulo    = document.getElementById('titulo').value.trim();
            const tipo      = document.getElementById('tipo').value;
            const finalidade = document.getElementById('finalidade').value;
            const status    = document.getElementById('status').value;
            const preco     = parseFloat(document.getElementById('preco').value)    || 0;
            const descricao = document.getElementById('descricao').value.trim();
            const quartos   = parseInt(document.getElementById('quartos').value)    || 0;
            const suites    = parseInt(document.getElementById('suites').value)     || 0;
            const vagas     = parseInt(document.getElementById('vagas').value)      || 0;
            const areaUtil  = parseFloat(document.getElementById('areaUtil').value) || 0;
            const areaTotal = parseFloat(document.getElementById('areaTotal').value)|| 0;
            const mapa_url  = document.getElementById('mapa_url').value.trim();
            const bairro    = document.getElementById('bairro').value.trim();
            const slug      = generateSlug(titulo);

            if (!titulo || !tipo) {
                throw new Error('Título e tipo são obrigatórios.');
            }

            // ── Imagem de destaque ───────────────────────────────────
            let imagemUrl = '';
            const fileInput = document.getElementById('imagem');
            if (fileInput.files.length > 0) {
                btn.innerHTML = 'Enviando imagem…';
                const file = fileInput.files[0];
                const ext  = file.name.split('.').pop().toLowerCase();
                imagemUrl  = await uploadFile(file, `imoveis/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
            } else if (id) {
                imagemUrl = imoveisCache.find(i => i.id === id)?.imagem || '';
            }

            // ── Galeria (append novas fotos às existentes) ───────────
            let galeriaUrls = [];
            if (id) {
                galeriaUrls = Array.isArray(imoveisCache.find(i => i.id === id)?.galeria)
                    ? imoveisCache.find(i => i.id === id).galeria
                    : [];
            }
            const galeriaInput = document.getElementById('galeria');
            if (galeriaInput.files.length > 0) {
                btn.innerHTML = `Enviando galeria (0/${galeriaInput.files.length})…`;
                const novas = await Promise.all(
                    Array.from(galeriaInput.files).map((file, idx) => {
                        const ext  = file.name.split('.').pop().toLowerCase();
                        const path = `imoveis/galeria/${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}.${ext}`;
                        return uploadFile(file, path);
                    })
                );
                galeriaUrls = [...galeriaUrls, ...novas];
            }

            // ── Se não enviou imagem de destaque, usa a 1ª da galeria ─
            if (!imagemUrl && galeriaUrls.length > 0) {
                imagemUrl = galeriaUrls[0];
            }

            // ── Salva no Firestore ───────────────────────────────────
            btn.innerHTML = 'Salvando…';
            const data = {
                titulo, tipo, finalidade, status, preco, descricao,
                quartos, suites, vagas, areaUtil, areaTotal,
                mapa_url, bairro, slug,
                imagem:  imagemUrl,
                galeria: galeriaUrls,
            };

            if (id) {
                await updateDoc(doc(db, 'imoveis', id), data);
            } else {
                data.createdAt = serverTimestamp();
                data.destaque  = false;
                await addDoc(collection(db, 'imoveis'), data);
            }

            msg.textContent = id ? 'Imóvel atualizado com sucesso!' : 'Imóvel cadastrado com sucesso!';
            msg.classList.add('show', 'ok');
            showToast(id ? 'Imóvel atualizado ✓' : 'Imóvel cadastrado ✓', 'ok');
            setTimeout(() => { fecharModal(); carregarImoveisAdmin(); }, 900);

        } catch (err) {
            msg.textContent = 'Erro: ' + err.message;
            msg.classList.add('show', 'err');
        } finally {
            btn.disabled = false;
            btn.innerHTML = labelOriginal;
        }
    });
}

// ============================================================
//  EXCLUSÃO
// ============================================================
let idParaExcluir = null;

window.confirmarExclusao = function(id) {
    idParaExcluir = id;
    document.getElementById('modal-confirm').classList.add('open');
};

function fecharConfirm() {
    document.getElementById('modal-confirm').classList.remove('open');
    idParaExcluir = null;
}

function initConfirmDelete() {
    const btn = document.getElementById('btn-confirm-del');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        if (!idParaExcluir) return;
        btn.disabled = true;
        try {
            await deleteDoc(doc(db, 'imoveis', idParaExcluir));
            showToast('Imóvel excluído com sucesso', 'ok');
            fecharConfirm();
            carregarImoveisAdmin();
        } catch (err) {
            showToast('Erro ao excluir: ' + err.message, 'err');
        } finally {
            btn.disabled = false;
        }
    });
}

// ============================================================
//  LEADS (Firestore)
// ============================================================
function initLeadsView() {
    document.getElementById('link-leads')?.addEventListener('click', e => {
        e.preventDefault();
        switchView('leads');
    });

    document.getElementById('leads-filter-status')
        ?.addEventListener('change', renderLeads);

    document.getElementById('tbody-leads')?.addEventListener('change', e => {
        const sel = e.target.closest('select[data-lead-id]');
        if (!sel) return;
        atualizarStatusLead(sel.dataset.leadId, sel.value);
    });
}

async function carregarLeads() {
    const tbody = document.getElementById('tbody-leads');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--c-text-mute); padding: 40px;">Carregando leads…</td></tr>`;

    try {
        const q        = query(collection(db, 'leads'), orderBy('criado_em', 'desc'));
        const snapshot = await getDocs(q);
        leadsCache     = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLeads();
        renderLeadsStats();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#FF8B8B; padding: 40px;">Erro ao carregar leads.</td></tr>`;
    }
}

function renderLeads() {
    const tbody       = document.getElementById('tbody-leads');
    const count       = document.getElementById('count-leads');
    const statusFiltro = document.getElementById('leads-filter-status')?.value || 'todos';

    let lista = leadsCache;
    if (statusFiltro !== 'todos') lista = lista.filter(l => l.status === statusFiltro);

    count.textContent = lista.length;

    if (!lista.length) {
        tbody.innerHTML = `
            <tr><td colspan="7">
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                    </svg>
                    <h4>Nenhum lead encontrado</h4>
                    <p>Os leads captados pelo site aparecerão aqui.</p>
                </div>
            </td></tr>`;
        return;
    }

    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

    tbody.innerHTML = lista.map(l => {
        // criado_em pode ser Timestamp do Firestore ou string ISO
        const criado  = l.criado_em?.toDate ? l.criado_em.toDate() : new Date(l.criado_em || Date.now());
        const dataStr = criado.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        const preco   = l.faixa_preco ? fmt.format(l.faixa_preco) : '—';
        const htBadge = l.classificacao === 'High Ticket'
            ? ' <span style="color:var(--c-gold);font-weight:700;font-size:0.7rem;">★ HT</span>' : '';
        const telDigits = (l.telefone || '').replace(/\D/g, '');

        return `
            <tr>
                <td><strong>${escHtml(l.nome)}</strong>${htBadge}</td>
                <td><a href="https://wa.me/55${escHtml(telDigits)}" target="_blank" style="color:var(--c-whatsapp);">${escHtml(l.telefone)}</a></td>
                <td>${escHtml(l.tipo_imovel || '—')}</td>
                <td>${preco}</td>
                <td style="font-size:0.82rem; color:var(--c-text-soft);">${escHtml(l.quartos || '—')} · ${escHtml(l.vagas || '—')}</td>
                <td>
                    <select class="form-control" style="padding:6px 10px;font-size:0.8rem;width:auto;" data-lead-id="${escHtml(l.id)}">
                        <option value="novo"          ${l.status === 'novo'           ? 'selected' : ''}>Novo</option>
                        <option value="em atendimento"${l.status === 'em atendimento' ? 'selected' : ''}>Em atendimento</option>
                        <option value="convertido"    ${l.status === 'convertido'     ? 'selected' : ''}>Convertido</option>
                        <option value="descartado"    ${l.status === 'descartado'     ? 'selected' : ''}>Descartado</option>
                    </select>
                </td>
                <td style="font-size:0.82rem; color:var(--c-text-soft); white-space:nowrap;">${escHtml(dataStr)}</td>
            </tr>`;
    }).join('');
}

function renderLeadsStats() {
    document.getElementById('stat-leads-total').textContent = leadsCache.length;
    document.getElementById('stat-leads-novos').textContent = leadsCache.filter(l => l.status === 'novo').length;
    document.getElementById('stat-leads-ht').textContent    = leadsCache.filter(l => l.classificacao === 'High Ticket').length;
    document.getElementById('stat-leads-conv').textContent  = leadsCache.filter(l => l.status === 'convertido').length;
}

window.atualizarStatusLead = async function(id, status) {
    try {
        await updateDoc(doc(db, 'leads', id), { status });
        const lead = leadsCache.find(l => l.id === id);
        if (lead) lead.status = status;
        renderLeadsStats();
        showToast('Status atualizado', 'ok');
    } catch {
        showToast('Erro ao atualizar status', 'err');
    }
};

// ============================================================
//  ANALYTICS (dados locais + Firestore leads)
// ============================================================
const _charts = {};

function destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

function mkChart(id, config) {
    destroyChart(id);
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;
    _charts[id] = new Chart(ctx, config);
}

const C = {
    gold:      '#C9A96E',
    goldLight: 'rgba(201,169,110,0.15)',
    green:     '#4ecdc4',
    red:       '#FF6B6B',
    blue:      '#74b9ff',
    purple:    '#a29bfe',
    orange:    '#fd9644',
    muted:     'rgba(255,255,255,0.1)',
    text:      'rgba(255,255,255,0.72)',
    gridLine:  'rgba(255,255,255,0.06)',
};
const PALETTE     = [C.gold, C.green, C.blue, C.purple, C.orange, C.red, '#ffeaa7', '#dfe6e9'];
const baseOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend:  { labels: { color: C.text, font: { family: 'Inter, sans-serif', size: 12 }, boxWidth: 12, padding: 16 } },
        tooltip: { backgroundColor: '#1a1a2e', titleColor: '#fff', bodyColor: C.text, borderColor: C.muted, borderWidth: 1 }
    }
};
const barScales = {
    x: { ticks: { color: C.text }, grid: { color: C.gridLine }, border: { color: C.gridLine } },
    y: { ticks: { color: C.text }, grid: { color: C.gridLine }, border: { color: C.gridLine }, beginAtZero: true }
};

async function renderAnalytics() {
    // ── KPIs de imóveis ───────────────────────────────────────
    const total = imoveisCache.length;
    const valor = imoveisCache
        .filter(i => i.status === 'Disponível' || !i.status)
        .reduce((s, i) => s + (parseFloat(i.preco) || 0), 0);
    document.getElementById('akpi-total').textContent = total;
    document.getElementById('akpi-valor').textContent = new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1
    }).format(valor);

    // ── Leads (carrega do Firestore se cache vazio) ───────────
    if (!leadsCache.length) {
        try {
            const q        = query(collection(db, 'leads'), orderBy('criado_em', 'desc'));
            const snapshot = await getDocs(q);
            leadsCache     = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { /* silencioso */ }
    }
    const totalLeads  = leadsCache.length;
    const convertidos = leadsCache.filter(l => l.status === 'convertido').length;
    document.getElementById('akpi-leads').textContent = totalLeads;
    document.getElementById('akpi-conv').textContent  = totalLeads
        ? Math.round((convertidos / totalLeads) * 100) + '%' : '0%';

    // ── Imóveis por tipo ──────────────────────────────────────
    const tiposMap = {};
    imoveisCache.forEach(i => { tiposMap[i.tipo] = (tiposMap[i.tipo] || 0) + 1; });
    mkChart('chart-tipo', {
        type: 'doughnut',
        data: { labels: Object.keys(tiposMap), datasets: [{ data: Object.values(tiposMap), backgroundColor: PALETTE, borderColor: 'transparent', hoverOffset: 6 }] },
        options: { ...baseOptions, cutout: '65%' }
    });

    // ── Imóveis por status ────────────────────────────────────
    const statusImap = { 'Disponível': 0, 'Vendido': 0, 'Reservado': 0 };
    imoveisCache.forEach(i => { const s = i.status || 'Disponível'; if (s in statusImap) statusImap[s]++; });
    mkChart('chart-status', {
        type: 'doughnut',
        data: { labels: ['Disponível', 'Vendido', 'Reservado'], datasets: [{ data: Object.values(statusImap), backgroundColor: [C.green, C.red, C.gold], borderColor: 'transparent', hoverOffset: 6 }] },
        options: { ...baseOptions, cutout: '65%' }
    });

    // ── Pipeline de leads ─────────────────────────────────────
    const slMap     = {};
    leadsCache.forEach(l => { slMap[l.status] = (slMap[l.status] || 0) + 1; });
    const slLabels  = { novo: 'Novos', 'em atendimento': 'Em atendimento', convertido: 'Convertidos', descartado: 'Descartados' };
    mkChart('chart-leads-status', {
        type: 'bar',
        data: {
            labels:   Object.keys(slLabels).map(k => slLabels[k]),
            datasets: [{ label: 'Leads', data: Object.keys(slLabels).map(k => slMap[k] || 0), backgroundColor: [C.blue, C.gold, C.green, C.red], borderRadius: 6 }]
        },
        options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } }, scales: barScales }
    });

    // ── High ticket ───────────────────────────────────────────
    const ht  = leadsCache.filter(l => l.classificacao === 'High Ticket').length;
    const nht = totalLeads - ht;
    mkChart('chart-leads-ht', {
        type: 'doughnut',
        data: { labels: ['High Ticket', 'Regular'], datasets: [{ data: [ht, nht], backgroundColor: [C.gold, C.muted], borderColor: 'transparent', hoverOffset: 6 }] },
        options: { ...baseOptions, cutout: '68%' }
    });

    // ── Imóveis por faixa de preço (substitui "top views") ────
    const faixas = { 'Até R$500k': 0, 'R$500k–1M': 0, 'R$1M–2M': 0, 'Acima R$2M': 0 };
    imoveisCache.forEach(i => {
        const p = i.preco || 0;
        if      (p <= 500000)  faixas['Até R$500k']++;
        else if (p <= 1000000) faixas['R$500k–1M']++;
        else if (p <= 2000000) faixas['R$1M–2M']++;
        else                   faixas['Acima R$2M']++;
    });
    mkChart('chart-top-views', {
        type: 'bar',
        data: {
            labels:   Object.keys(faixas),
            datasets: [{ data: Object.values(faixas), backgroundColor: C.goldLight, borderColor: C.gold, borderWidth: 2, borderRadius: 6 }]
        },
        options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } }, scales: barScales }
    });
    // Atualiza o título do card de analytics
    const topCard = document.querySelector('#chart-top-views')?.closest('.admin-card');
    const topHead = topCard?.querySelector('.admin-card-head h3');
    if (topHead) topHead.textContent = 'Imóveis por faixa de preço';
}

// ============================================================
//  TOAST
// ============================================================
function showToast(msg, type = 'ok') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className   = `toast show ${type}`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), 2800);
}
