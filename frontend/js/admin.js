// =========================================================
// REGINALDO IMÓVEIS — Admin Script
// =========================================================

let imoveisCache = [];
let editandoId = null;
let refreshTimer = null;

function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    initLogin();
    initLogout();
    initModal();
    initForm();
    initSearchAndFilter();
    initLeadsView();
    initSidebarNav();
});

async function checkAuthStatus() {
    try {
        const res = await fetch('/api/auth/2fa/status', { credentials: 'include' });
        if (res.ok) {
            showPanel();
            scheduleRefresh();
        }
    } catch (e) { /* not authenticated */ }
}

// ============================ TOKEN REFRESH ============================
function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAccessToken, 13 * 60 * 1000);
}

async function refreshAccessToken() {
    try {
        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            scheduleRefresh();
            return true;
        }
        return false;
    } catch { return false; }
}

function forceLogout() {
    clearTimeout(refreshTimer);
    fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' }).catch(() => {});
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    showToast('Sessão expirada. Faça login novamente.', 'err');
}

// ============================ LOGIN ============================
function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;

    let pendingPassword = null;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const senhaEl = document.getElementById('admin-password');
        const totpEl = document.getElementById('admin-totp');
        const err = document.getElementById('login-error');
        const totpGroup = document.getElementById('totp-group');

        const senha = pendingPassword || senhaEl.value;
        const totpCode = totpEl ? totpEl.value.trim() : '';

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password: senha, totp_code: totpCode || undefined })
            });
            const data = await res.json();

            if (data.requires_2fa) {
                pendingPassword = senha;
                if (totpGroup) {
                    totpGroup.style.display = 'block';
                    totpEl?.focus();
                }
                err.textContent = 'Digite o código do seu app autenticador.';
                err.classList.add('show');
                err.style.color = 'var(--c-gold, #C4A26B)';
                return;
            }

            if (data.success) {
                pendingPassword = null;
                err.classList.remove('show');
                err.style.color = '';
                if (totpGroup) totpGroup.style.display = 'none';
                showPanel();
                scheduleRefresh();
            } else {
                err.textContent = data.message || 'Senha incorreta. Tente novamente.';
                err.classList.add('show');
                err.style.color = '';
            }
        } catch (e) {
            err.textContent = 'Erro de conexão com o servidor.';
            err.classList.add('show');
            err.style.color = '';
        }
    });
}

function initLogout() {
    const btn = document.getElementById('btn-logout');
    if (!btn) return;
    btn.addEventListener('click', () => {
        clearTimeout(refreshTimer);
        fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' }).catch(() => {});
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('admin-password').value = '';
        const totpGroup = document.getElementById('totp-group');
        if (totpGroup) totpGroup.style.display = 'none';
    });
}

function showPanel() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    carregarImoveisAdmin();
}

// ============================ SIDEBAR NAV ============================
function initSidebarNav() {
    const linkImoveis = document.querySelector('[data-view="imoveis"]');
    if (linkImoveis) {
        linkImoveis.addEventListener('click', (e) => {
            e.preventDefault();
            switchView('imoveis');
        });
    }
    const linkSeg = document.getElementById('link-seguranca');
    if (linkSeg) {
        linkSeg.addEventListener('click', (e) => {
            e.preventDefault();
            switchView('seguranca');
        });
    }
}

// ============================ LISTA ============================
async function carregarImoveisAdmin() {
    const tbody = document.getElementById('tbody-imoveis');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--c-text-mute); padding: 40px;">Carregando imóveis…</td></tr>`;

    try {
        const res = await fetch('/api/imoveis?tipo=todos');
        const json = await res.json();
        imoveisCache = Array.isArray(json) ? json : (json.data || []);
        renderTabela();
        renderStats();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#FF8B8B; padding: 40px;">Erro ao carregar imóveis.</td></tr>`;
        console.error(err);
    }
}

function renderTabela() {
    const tbody = document.getElementById('tbody-imoveis');
    const count = document.getElementById('count-imoveis');
    const busca = document.getElementById('admin-search-input').value.trim().toLowerCase();
    const statusFiltro = document.getElementById('admin-filter-status').value;

    let lista = imoveisCache;

    if (busca) {
        lista = lista.filter(i =>
            (i.titulo || '').toLowerCase().includes(busca) ||
            (i.tipo || '').toLowerCase().includes(busca) ||
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
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <h4>Nenhum imóvel encontrado</h4>
                    <p>Cadastre um novo imóvel para começar.</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(i => {
        const preco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(i.preco);
        const statusClass = (i.status || 'Disponível').toLowerCase().replace(/[áàâã]/g,'a').replace(/[éê]/g,'e').replace(/[í]/g,'i');
        const img = escHtml(i.imagem) || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=200&auto=format';

        return `
            <tr data-id="${parseInt(i.id)}">
                <td>
                    <img class="imovel-row-img" src="${img}" alt="${escHtml(i.titulo)}" onerror="this.src='https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=200&auto=format'">
                </td>
                <td>
                    <div class="row-titulo">${escHtml(i.titulo)}</div>
                    <div class="row-tipo">${escHtml(i.tipo)} · ${escHtml(i.finalidade || 'Venda')}</div>
                </td>
                <td><span class="status-pill ${escHtml(statusClass)}">${escHtml(i.status || 'Disponível')}</span></td>
                <td style="color: var(--c-text-soft); font-size: 0.88rem;">
                    ${i.quartos > 0 ? parseInt(i.quartos) + ' dorms · ' : ''}${i.vagas > 0 ? parseInt(i.vagas) + ' vagas · ' : ''}${i.areaUtil > 0 ? parseFloat(i.areaUtil) + 'm²' : ''}
                </td>
                <td><div class="row-preco">${preco}</div></td>
                <td>
                    <div class="row-actions">
                        <a class="btn-action" href="/detalhes?id=${parseInt(i.id)}" target="_blank" title="Ver no site">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </a>
                        <button class="btn-action" onclick="abrirEdicao(${parseInt(i.id)})" title="Editar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-action del" onclick="confirmarExclusao(${parseInt(i.id)})" title="Excluir">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderStats() {
    const total = imoveisCache.length;
    const disp = imoveisCache.filter(i => i.status === 'Disponível' || !i.status).length;
    const vend = imoveisCache.filter(i => i.status === 'Vendido').length;
    const valor = imoveisCache
        .filter(i => i.status === 'Disponível' || !i.status)
        .reduce((s, i) => s + (parseFloat(i.preco) || 0), 0);

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-disponivel').textContent = disp;
    document.getElementById('stat-vendido').textContent = vend;
    document.getElementById('stat-valor').textContent = new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1
    }).format(valor);
}

function initSearchAndFilter() {
    const input = document.getElementById('admin-search-input');
    const sel = document.getElementById('admin-filter-status');
    if (input) input.addEventListener('input', renderTabela);
    if (sel) sel.addEventListener('change', renderTabela);
}

// ============================ MODAL ============================
function initModal() {
    const overlay = document.getElementById('modal-imovel');

    document.getElementById('btn-novo').addEventListener('click', abrirNovo);
    const linkNovo = document.getElementById('link-novo');
    if (linkNovo) linkNovo.addEventListener('click', (e) => { e.preventDefault(); abrirNovo(); });

    document.getElementById('btn-modal-close').addEventListener('click', fecharModal);
    document.getElementById('btn-cancel').addEventListener('click', fecharModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });

    // Preview da imagem de destaque
    document.getElementById('imagem').addEventListener('change', (e) => {
        const f = e.target.files[0];
        const preview = document.getElementById('preview-imagem');
        if (f) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                preview.src = ev.target.result;
                preview.classList.add('show');
            };
            reader.readAsDataURL(f);
        } else {
            preview.classList.remove('show');
        }
    });

    // Preview da galeria
    document.getElementById('galeria').addEventListener('change', (e) => {
        const container = document.getElementById('preview-galeria');
        container.innerHTML = '';
        Array.from(e.target.files).forEach((f, i) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const thumb = document.createElement('div');
                thumb.className = 'galeria-thumb';
                thumb.innerHTML = `<img src="${ev.target.result}" alt="Foto ${i + 1}">`;
                container.appendChild(thumb);
            };
            reader.readAsDataURL(f);
        });
    });

    // Modal confirmar
    document.getElementById('btn-confirm-cancel').addEventListener('click', fecharConfirm);
    document.getElementById('modal-confirm').addEventListener('click', (e) => {
        if (e.target.id === 'modal-confirm') fecharConfirm();
    });
}

function abrirNovo() {
    editandoId = null;
    document.getElementById('modal-title').innerHTML = 'Novo <em style="font-style:italic; font-family: var(--font-serif); color: var(--c-gold);">imóvel</em>';
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
    document.getElementById('modal-title').innerHTML = 'Editar <em style="font-style:italic; font-family: var(--font-serif); color: var(--c-gold);">imóvel</em>';
    document.getElementById('imovel-id').value = id;
    document.getElementById('titulo').value = imovel.titulo || '';
    document.getElementById('tipo').value = imovel.tipo || 'Apartamento';
    document.getElementById('finalidade').value = imovel.finalidade || 'Venda';
    document.getElementById('status').value = imovel.status || 'Disponível';
    document.getElementById('preco').value = imovel.preco || '';
    document.getElementById('descricao').value = imovel.descricao || '';
    document.getElementById('quartos').value = imovel.quartos || 0;
    document.getElementById('suites').value = imovel.suites || 0;
    document.getElementById('vagas').value = imovel.vagas || 0;
    document.getElementById('areaUtil').value = imovel.areaUtil || 0;
    document.getElementById('areaTotal').value = imovel.areaTotal || 0;
    document.getElementById('imagem').value = '';
    document.getElementById('galeria').value = '';
    document.getElementById('mapa_url').value = imovel.mapa_url || '';

    const preview = document.getElementById('preview-imagem');
    if (imovel.imagem) {
        preview.src = imovel.imagem;
        preview.classList.add('show');
    } else {
        preview.classList.remove('show');
    }

    const galeriaContainer = document.getElementById('preview-galeria');
    galeriaContainer.innerHTML = '';
    try {
        const fotos = JSON.parse(imovel.galeria || '[]');
        fotos.forEach(src => {
            const thumb = document.createElement('div');
            thumb.className = 'galeria-thumb';
            thumb.innerHTML = `<img src="${src}" alt="Galeria">`;
            galeriaContainer.appendChild(thumb);
        });
    } catch(e) {}

    document.getElementById('form-msg').classList.remove('show', 'ok', 'err');
    document.getElementById('modal-imovel').classList.add('open');
};

function fecharModal() {
    document.getElementById('modal-imovel').classList.remove('open');
}

// ============================ FORM SUBMIT ============================
function initForm() {
    document.getElementById('imovel-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-salvar');
        const msg = document.getElementById('form-msg');
        const id = document.getElementById('imovel-id').value;

        btn.disabled = true;
        const labelOriginal = btn.innerHTML;
        btn.innerHTML = 'Salvando…';
        msg.classList.remove('show', 'ok', 'err');

        const formData = new FormData();
        formData.append('titulo', document.getElementById('titulo').value);
        formData.append('tipo', document.getElementById('tipo').value);
        formData.append('finalidade', document.getElementById('finalidade').value);
        formData.append('status', document.getElementById('status').value);
        formData.append('preco', document.getElementById('preco').value);
        formData.append('descricao', document.getElementById('descricao').value);
        formData.append('quartos', document.getElementById('quartos').value);
        formData.append('suites', document.getElementById('suites').value);
        formData.append('vagas', document.getElementById('vagas').value);
        formData.append('areaUtil', document.getElementById('areaUtil').value);
        formData.append('areaTotal', document.getElementById('areaTotal').value);

        formData.append('mapa_url', document.getElementById('mapa_url').value);

        const fileInput = document.getElementById('imagem');
        if (fileInput.files.length > 0) {
            formData.append('imagem', fileInput.files[0]);
        }

        const galeriaInput = document.getElementById('galeria');
        Array.from(galeriaInput.files).forEach(f => {
            formData.append('galeria', f);
        });

        try {
            const url = id ? `/api/imoveis/${id}` : '/api/imoveis';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, { method, body: formData, credentials: 'include' });
            const data = await res.json();

            if (res.ok && data.success) {
                msg.textContent = id ? 'Imóvel atualizado com sucesso!' : 'Imóvel cadastrado com sucesso!';
                msg.classList.add('show', 'ok');
                showToast(id ? 'Imóvel atualizado' : 'Imóvel cadastrado', 'ok');
                setTimeout(() => {
                    fecharModal();
                    carregarImoveisAdmin();
                }, 800);
            } else {
                msg.textContent = data.error || 'Erro ao salvar o imóvel.';
                msg.classList.add('show', 'err');
                if (res.status === 403 || res.status === 401) {
                    const refreshed = await refreshAccessToken();
                    if (!refreshed) forceLogout();
                }
            }
        } catch (err) {
            console.error(err);
            msg.textContent = 'Erro de comunicação com o servidor.';
            msg.classList.add('show', 'err');
        } finally {
            btn.disabled = false;
            btn.innerHTML = labelOriginal;
        }
    });
}

// ============================ EXCLUSÃO ============================
let idParaExcluir = null;

window.confirmarExclusao = function(id) {
    idParaExcluir = id;
    document.getElementById('modal-confirm').classList.add('open');
};

function fecharConfirm() {
    document.getElementById('modal-confirm').classList.remove('open');
    idParaExcluir = null;
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-confirm-del');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        if (!idParaExcluir) return;
        btn.disabled = true;
        try {
            const res = await fetch(`/api/imoveis/${idParaExcluir}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Imóvel excluído', 'ok');
                fecharConfirm();
                carregarImoveisAdmin();
            } else {
                showToast(data.error || 'Erro ao excluir', 'err');
            }
        } catch (err) {
            showToast('Erro de conexão', 'err');
        } finally {
            btn.disabled = false;
        }
    });
});

// ============================ LEADS ============================
let leadsCache = [];

function initLeadsView() {
    const linkLeads = document.getElementById('link-leads');
    if (!linkLeads) return;

    linkLeads.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('leads');
    });

    const filterSel = document.getElementById('leads-filter-status');
    if (filterSel) filterSel.addEventListener('change', () => renderLeads());
}

function switchView(view) {
    const viewLeads = document.getElementById('view-leads');
    const viewSeg = document.getElementById('view-seguranca');
    const menuLinks = document.querySelectorAll('.admin-menu a[data-view]');

    menuLinks.forEach(a => a.classList.remove('active'));

    // Hide all main content sections
    const mainEl = document.querySelector('.admin-main');
    if (mainEl) {
        Array.from(mainEl.children).forEach(child => {
            if (child.id !== 'view-leads' && child.id !== 'view-seguranca') {
                child.style.display = (view === 'imoveis' || !view) ? '' : 'none';
            }
        });
    }
    if (viewLeads) viewLeads.style.display = 'none';
    if (viewSeg) viewSeg.style.display = 'none';

    if (view === 'leads') {
        viewLeads.style.display = 'block';
        document.querySelector('[data-view="leads"]')?.classList.add('active');
        carregarLeads();
    } else if (view === 'seguranca') {
        viewSeg.style.display = 'block';
        document.querySelector('[data-view="seguranca"]')?.classList.add('active');
        load2faStatus();
    } else {
        document.querySelector('[data-view="imoveis"]')?.classList.add('active');
    }
}

async function carregarLeads() {
    const tbody = document.getElementById('tbody-leads');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--c-text-mute); padding: 40px;">Carregando leads…</td></tr>`;

    try {
        const res = await fetch('/api/leads', { credentials: 'include' });
        if (!res.ok) throw new Error('Não autorizado');
        leadsCache = await res.json();
        renderLeads();
        renderLeadsStats();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#FF8B8B; padding: 40px;">Erro ao carregar leads.</td></tr>`;
        console.error(err);
    }
}

function renderLeads() {
    const tbody = document.getElementById('tbody-leads');
    const count = document.getElementById('count-leads');
    const statusFiltro = document.getElementById('leads-filter-status')?.value || 'todos';

    let lista = leadsCache;
    if (statusFiltro !== 'todos') {
        lista = lista.filter(l => l.status === statusFiltro);
    }

    count.textContent = lista.length;

    if (!lista.length) {
        tbody.innerHTML = `
            <tr><td colspan="7">
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    <h4>Nenhum lead encontrado</h4>
                    <p>Os leads captados pelo site aparecerão aqui.</p>
                </div>
            </td></tr>`;
        return;
    }

    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

    tbody.innerHTML = lista.map(l => {
        const data = new Date(l.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        const preco = l.faixa_preco ? fmt.format(l.faixa_preco) : '—';
        const htBadge = l.classificacao === 'High Ticket' ? ' <span style="color:var(--c-gold);font-weight:700;font-size:0.7rem;">★ HT</span>' : '';
        const telDigits = (l.telefone || '').replace(/\D/g, '');

        return `
            <tr>
                <td><strong>${escHtml(l.nome)}</strong>${htBadge}</td>
                <td><a href="https://wa.me/55${escHtml(telDigits)}" target="_blank" style="color:var(--c-whatsapp);">${escHtml(l.telefone)}</a></td>
                <td>${escHtml(l.tipo_imovel || '—')}</td>
                <td>${preco}</td>
                <td style="font-size:0.82rem; color:var(--c-text-soft);">${escHtml(l.quartos || '—')} · ${escHtml(l.vagas || '—')}</td>
                <td>
                    <select class="form-control" style="padding:6px 10px; font-size:0.8rem; width:auto;" onchange="atualizarStatusLead(${parseInt(l.id)}, this.value)">
                        <option value="novo" ${l.status === 'novo' ? 'selected' : ''}>Novo</option>
                        <option value="em atendimento" ${l.status === 'em atendimento' ? 'selected' : ''}>Em atendimento</option>
                        <option value="convertido" ${l.status === 'convertido' ? 'selected' : ''}>Convertido</option>
                        <option value="descartado" ${l.status === 'descartado' ? 'selected' : ''}>Descartado</option>
                    </select>
                </td>
                <td style="font-size:0.82rem; color:var(--c-text-soft); white-space:nowrap;">${escHtml(data)}</td>
            </tr>
        `;
    }).join('');
}

function renderLeadsStats() {
    const total = leadsCache.length;
    const novos = leadsCache.filter(l => l.status === 'novo').length;
    const ht = leadsCache.filter(l => l.classificacao === 'High Ticket').length;
    const conv = leadsCache.filter(l => l.status === 'convertido').length;

    document.getElementById('stat-leads-total').textContent = total;
    document.getElementById('stat-leads-novos').textContent = novos;
    document.getElementById('stat-leads-ht').textContent = ht;
    document.getElementById('stat-leads-conv').textContent = conv;
}

window.atualizarStatusLead = async function(id, status) {
    try {
        const res = await fetch(`/api/leads/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            const lead = leadsCache.find(l => l.id === id);
            if (lead) lead.status = status;
            renderLeadsStats();
            showToast('Status atualizado', 'ok');
        } else {
            showToast('Erro ao atualizar status', 'err');
        }
    } catch (err) {
        showToast('Erro de conexão', 'err');
    }
};

// ============================ 2FA SETUP ============================
let pending2faSecret = null;

async function load2faStatus() {
    const statusText = document.getElementById('2fa-status-text');
    const setupArea = document.getElementById('2fa-setup-area');
    const disableArea = document.getElementById('2fa-disable-area');

    try {
        const res = await fetch('/api/auth/2fa/status', { credentials: 'include' });
        const data = await res.json();

        if (data.enabled) {
            statusText.innerHTML = 'Status: <strong style="color: #4ecdc4;">2FA Ativo ✓</strong>';
            setupArea.style.display = 'none';
            disableArea.style.display = 'block';
        } else {
            statusText.innerHTML = 'Status: <strong style="color: var(--c-text-mute);">2FA Desativado</strong>';
            setupArea.style.display = 'none';
            disableArea.style.display = 'none';
            await start2faSetup();
        }
    } catch {
        statusText.textContent = 'Erro ao verificar status.';
    }
}

async function start2faSetup() {
    const setupArea = document.getElementById('2fa-setup-area');

    try {
        const res = await fetch('/api/auth/2fa/setup', {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            pending2faSecret = data.secret;
            document.getElementById('2fa-qr-img').src = data.qrCode;
            document.getElementById('2fa-secret-code').textContent = data.secret;
            setupArea.style.display = 'block';
        }
    } catch {
        document.getElementById('2fa-status-text').textContent = 'Erro ao gerar QR Code.';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnConfirm = document.getElementById('btn-2fa-confirm');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            const code = document.getElementById('2fa-confirm-code').value.trim();
            const msg = document.getElementById('2fa-setup-msg');

            if (!code || code.length !== 6) {
                msg.textContent = 'Digite o código de 6 dígitos.';
                msg.style.color = '#FF8B8B';
                return;
            }

            try {
                const res = await fetch('/api/auth/2fa/enable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ secret: pending2faSecret, code })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('2FA ativado com sucesso!', 'ok');
                    load2faStatus();
                } else {
                    msg.textContent = data.error || 'Código inválido.';
                    msg.style.color = '#FF8B8B';
                }
            } catch {
                msg.textContent = 'Erro de conexão.';
                msg.style.color = '#FF8B8B';
            }
        });
    }

    const btnDisable = document.getElementById('btn-2fa-disable');
    if (btnDisable) {
        btnDisable.addEventListener('click', async () => {
            const code = document.getElementById('2fa-disable-code').value.trim();
            const msg = document.getElementById('2fa-disable-msg');

            if (!code || code.length !== 6) {
                msg.textContent = 'Digite o código de 6 dígitos.';
                msg.style.color = '#FF8B8B';
                return;
            }

            try {
                const res = await fetch('/api/auth/2fa/disable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ code })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('2FA desativado.', 'ok');
                    load2faStatus();
                } else {
                    msg.textContent = data.error || 'Código inválido.';
                    msg.style.color = '#FF8B8B';
                }
            } catch {
                msg.textContent = 'Erro de conexão.';
                msg.style.color = '#FF8B8B';
            }
        });
    }
});

// ============================ TOAST ============================
function showToast(msg, type = 'ok') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), 2800);
}
