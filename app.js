// UDP Hub — navegacion por burbujas (Canvas + Jarvis + Negocio + reloj)
// data/graph.json define el arbol de burbujas. Jarvis vive como chat arriba.
// El fondo de la Tierra vive en earth.js. Backend (Cloudflare Worker) sirve
// Canvas, Negocio y las respuestas de Jarvis.

const stage = document.getElementById('stage');
const centerBubble = document.getElementById('center-bubble');
const field = document.getElementById('bubble-field');
const linesSvg = document.getElementById('lines');
const crumbTitle = document.getElementById('crumbTitle');
const backBtn = document.getElementById('backBtn');
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panelTitle');
const panelBody = document.getElementById('panelBody');
const closePanelBtn = document.getElementById('closePanel');

let graph = null;
let manifest = null;
let extra = { canvas: null, evaluaciones: null, resumen: null };
let history = [];

const CAT_ICON_FALLBACK = '📁';

// URL del backend (Cloudflare Worker) que sirve Canvas, Negocio y Jarvis.
const BACKEND = 'https://hub.vicentevargasblanco.workers.dev';

init();
initJarvis();
initClock();

async function init() {
  const [g, m, c, e, r] = await Promise.allSettled([
    fetchJSON('data/graph.json'),
    fetchJSON('data/manifest.json'),
    fetchJSON('data/canvas.json'),
    fetchJSON('data/evaluaciones.json'),
    fetchJSON('data/resumen.json'),
  ]);
  graph = g.status === 'fulfilled' ? g.value : { root: 'root', nodes: { root: { label: 'Hub', icon: '🎓', type: 'group', children: [] } } };
  manifest = m.status === 'fulfilled' ? m.value : { courses: [] };
  extra.canvas = c.status === 'fulfilled' ? c.value : null;
  extra.evaluaciones = e.status === 'fulfilled' ? e.value : null;
  extra.resumen = r.status === 'fulfilled' ? r.value : null;

  graph = applyGraphOverrides(graph);
  history = [graph.root];
  renderCurrentNode();

  window.addEventListener('resize', () => renderCurrentNode(false));
  backBtn.addEventListener('click', goBack);
  centerBubble.addEventListener('click', () => {
    if (history.length > 1) { history = [graph.root]; renderCurrentNode(true); }
  });
  closePanelBtn.addEventListener('click', closePanel);
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error('missing ' + path);
  return res.json();
}

function node(id) { return (graph.nodes || {})[id]; }

function goBack() {
  if (history.length <= 1) return;
  history.pop();
  renderCurrentNode(true);
}

function childItems(n) {
  if (n.type === 'course') {
    const course = (manifest.courses || []).find(c => c.slug === n.slug);
    if (!course) return [];
    return course.categories.map(cat => ({
      id: 'cat:' + n.slug + ':' + cat.key,
      label: cat.label,
      icon: cat.icon || CAT_ICON_FALLBACK,
      count: cat.files.length,
      categoryRef: cat,
      courseRef: course,
    }));
  }
  if (Array.isArray(n.children)) {
    return n.children.map(id => ({ id, label: node(id)?.label || id, icon: node(id)?.icon || '•', url: node(id)?.url }));
  }
  return [];
}

function renderCurrentNode(animate = false) {
  const id = history[history.length - 1];
  const n = node(id);
  if (!n) return;

  crumbTitle.textContent = n.label;
  backBtn.classList.toggle('hidden', history.length <= 1);
  closePanel();

  if (window.__earth) window.__earth.setDepth(history.length);

  if (history.length <= 1) {
    renderRing(n, animate);
  } else {
    const parentId = history[history.length - 2];
    renderExpanded(node(parentId), id, animate);
  }
}

function placeFrom(el, x, y, fx, fy, fs, delay, animate) {
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  if (animate) {
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = `translate(calc(-50% + ${fx - x}px), calc(-50% + ${fy - y}px)) scale(${fs})`;
    field.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = '';
      el.style.transitionDelay = delay + 'ms';
      el.style.transform = 'translate(-50%, -50%)';
      el.style.opacity = '1';
    }));
  } else {
    el.style.transform = 'translate(-50%, -50%)';
    field.appendChild(el);
  }
}

function ensureEditDot(el, id, parentId) {
  const old = el.querySelector(':scope > .edit-dot');
  if (old) old.remove();
  const eb = document.createElement('button');
  eb.className = 'edit-dot';
  eb.type = 'button';
  eb.textContent = '⋯';
  eb.setAttribute('aria-label', 'Editar burbuja');
  eb.addEventListener('click', (ev) => { ev.stopPropagation(); openEditMenu(id, parentId); });
  el.appendChild(eb);
}

function makeBubble(sizeClass, item, parentId, onClick) {
  const el = document.createElement('div');
  el.className = 'bubble ' + sizeClass;
  const nd = node(item.id);
  if (nd && nd.type === 'link') el.classList.add('is-link');
  const icon = (nd && nd.icon) || item.icon || '•';
  const label = (nd && nd.label) || item.label || '';
  if (item.count !== undefined) { el.classList.add('badge'); el.setAttribute('data-badge', item.count); }
  el.innerHTML = `<span class="bubble-icon">${icon}</span><span class="bubble-label">${escapeHtml(label)}</span>`;
  el.addEventListener('click', onClick || (() => onBubbleClick(item, node(parentId))));
  if (!item.categoryRef) ensureEditDot(el, item.id, parentId);
  return el;
}

function renderRing(n, animate) {
  const curId = history[history.length - 1];
  centerBubble.classList.remove('hidden');
  setCenter(n.icon, n.label);

  const rect = stage.getBoundingClientRect();
  const M = Math.min(rect.width, rect.height);
  const ax = rect.width * 0.20;
  const ay = rect.height * 0.5;
  centerBubble.style.left = ax + 'px';
  centerBubble.style.top = ay + 'px';
  ensureEditDot(centerBubble, curId, null);

  clearField(animate);
  const items = childItems(n);
  const RR = M * 0.40;
  const m = items.length;
  items.forEach((item, j) => {
    const t = m > 1 ? j / (m - 1) : 0.5;
    const ang = (-80 + 160 * t) * (Math.PI / 180);
    const x = ax + RR * Math.cos(ang);
    const y = ay + RR * Math.sin(ang);
    drawLine(ax, ay, x, y);
    const el = makeBubble('main', item, curId);
    placeFrom(el, x, y, ax, ay, 0.4, 60 + j * 30, animate);
  });
}

function renderExpanded(parentNode, selectedId, animate) {
  if (!parentNode) return;
  centerBubble.classList.add('hidden');
  clearField(animate);

  const rect = stage.getBoundingClientRect();
  const M = Math.min(rect.width, rect.height);
  const ax = rect.width * 0.26;
  const ay = rect.height * 0.5;
  const parentId = history[history.length - 2];

  const siblings = childItems(parentNode);
  const selItem = siblings.find(it => it.id === selectedId) || { id: selectedId };
  const selNode = node(selectedId) || {};
  const others = siblings.filter(it => it.id !== selectedId);

  const big = document.createElement('div');
  big.className = 'bubble expanded';
  big.innerHTML = `<span class="bubble-icon">${selNode.icon || selItem.icon || '•'}</span><span class="bubble-label">${escapeHtml(selNode.label || selItem.label || '')}</span>`;
  big.addEventListener('click', goBack);
  ensureEditDot(big, selectedId, parentId);
  placeFrom(big, ax, ay, ax, ay, 0.78, 0, animate);

  const RL = M * 0.30;
  const k = others.length;
  others.forEach((it, j) => {
    const t = k > 1 ? j / (k - 1) : 0.5;
    const ang = (118 + 124 * t) * (Math.PI / 180);
    const x = ax + RL * Math.cos(ang);
    const y = ay + RL * Math.sin(ang);
    const el = makeBubble('shrunk', it, parentId, () => {
      history[history.length - 1] = it.id;
      if (window.__earth) window.__earth.pulse();
      renderCurrentNode(true);
    });
    placeFrom(el, x, y, ax, ay, 1.0, j * 25, animate);
  });

  const subs = childItems(selNode);
  const RR = M * 0.36;
  const m = subs.length;
  subs.forEach((it, j) => {
    const t = m > 1 ? j / (m - 1) : 0.5;
    const ang = (-62 + 124 * t) * (Math.PI / 180);
    const x = ax + RR * Math.cos(ang);
    const y = ay + RR * Math.sin(ang);
    drawLine(ax, ay, x, y);
    const el = makeBubble('sub', it, selectedId);
    placeFrom(el, x, y, ax, ay, 0.3, 130 + j * 45, animate);
  });
}

function onBubbleClick(item, parentNode) {
  if (window.__earth) window.__earth.pulse();
  if (item.categoryRef) {
    openCategoryPanel(item.courseRef, item.categoryRef);
    return;
  }
  const childNode = node(item.id);
  if (!childNode) return;
  if (childNode.type === 'link' && childNode.url) {
    window.open(childNode.url, '_blank', 'noopener');
    return;
  }
  if (childNode.type === 'group' || childNode.type === 'course') {
    history.push(item.id);
    renderCurrentNode(true);
  } else if (childNode.type && childNode.type.startsWith('panel:')) {
    openPanelForNode(item.id, childNode);
  }
}

function setCenter(icon, label) {
  centerBubble.querySelector('.bubble-icon').textContent = icon;
  centerBubble.querySelector('.bubble-label').textContent = label;
}

function clearField(animate) {
  linesSvg.innerHTML = '';
  if (!animate) { field.innerHTML = ''; return; }
  const rect = stage.getBoundingClientRect();
  const cx = rect.width / 2;
  Array.from(field.children).forEach(el => {
    const left = parseFloat(el.style.left) || cx;
    const dir = left < cx ? -1 : 1;
    el.style.pointerEvents = 'none';
    el.style.transform = `translate(calc(-50% + ${dir * 110}px), -50%) scale(0.82)`;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 340);
  });
}

function drawLine(x1, y1, x2, y2) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  linesSvg.appendChild(line);
}

function openPanel(title) { panelTitle.textContent = title; panel.classList.remove('hidden'); }
function closePanel() { panel.classList.add('hidden'); panelBody.innerHTML = ''; }

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return 'sin fecha';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + ' ' +
           d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso; }
}

function openCategoryPanel(course, cat) {
  openPanel(`${course.displayName} · ${cat.label}`);
  if (!cat.files.length) {
    panelBody.innerHTML = `<div class="empty-state">Todavía no hay archivos aquí.</div>`;
    return;
  }
  panelBody.innerHTML = cat.files.map(f => `
    <a class="file-row" href="${encodeURI(f.path)}" target="_blank" rel="noopener">
      <div>
        <div class="file-name">${escapeHtml(f.name)}</div>
        <div class="file-meta">${fmtSize(f.size)}</div>
      </div>
      <div class="file-open">Abrir →</div>
    </a>
  `).join('');
}

function openPanelForNode(id, n) {
  if (n.type === 'panel:canvas') return renderCanvasPanel();
  if (n.type === 'panel:evaluaciones') return renderEvaluacionesPanel();
  if (n.type === 'panel:resumen') return renderResumenPanel();
  if (n.type === 'panel:avisos') return renderAvisosPanel();
  if (n.type === 'panel:jarvis') return renderJarvisPanel(n);
  if (n.type === 'panel:negocio') return renderNegocioPanel();
  if (n.type === 'panel:placeholder') return renderPlaceholderPanel(n);
}

function pendingBlock(msg) { return `<div class="empty-state">${msg}</div>`; }

async function renderCanvasPanel() {
  openPanel('Canvas');
  panelBody.innerHTML = `<div class="empty-state">Cargando tus cursos desde Canvas…</div>`;
  try {
    const res = await fetch(BACKEND + '/canvas/summary', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const courses = (data && data.courses) || [];
    if (!courses.length) {
      panelBody.innerHTML = pendingBlock('No hay cursos o tareas próximas en Canvas por ahora.');
      return;
    }
    panelBody.innerHTML = courses.map(c => `
      <div class="summary-card">
        <strong>${escapeHtml(c.name)}</strong>
        ${(c.assignments || []).map(a => `
          <div class="evalu-item" style="margin-top:8px;">
            <div>${escapeHtml(a.name)}</div>
            <div class="file-meta">Vence: ${escapeHtml(fmtDate(a.due_at))}</div>
          </div>
        `).join('') || '<div class="file-meta">Sin tareas próximas</div>'}
      </div>
    `).join('');
  } catch (e) {
    panelBody.innerHTML = pendingBlock('No se pudo conectar con Canvas. Verifica que el backend esté activo y el token configurado. (' + escapeHtml(String((e && e.message) || e)) + ')');
  }
}

// NEGOCIO EN VIVO (Shopify + Meta Ads, vía backend Cloudflare Worker)
async function renderNegocioPanel() {
  openPanel('Negocio');
  panelBody.innerHTML = `<div class="empty-state">Cargando métricas del negocio…</div>`;
  let data = {};
  try {
    const res = await fetch(BACKEND + '/business/summary', { cache: 'no-store' });
    data = await res.json().catch(() => ({}));
  } catch (e) { data = {}; }

  const sh = data.shopify;
  const mt = data.meta;
  let html = '';

  if (sh && !sh.error) {
    html += `
      <div class="summary-card">
        <strong>🛒 Shopify · últimas 24 h</strong>
        <div class="biz-stats">
          <div class="biz-stat"><span class="biz-num">${escapeHtml(String(sh.orders ?? 0))}</span><span class="biz-lbl">pedidos</span></div>
          <div class="biz-stat"><span class="biz-num">${escapeHtml(sh.revenue_fmt || String(sh.revenue ?? 0))}</span><span class="biz-lbl">ventas</span></div>
        </div>
      </div>`;
  } else {
    html += `<div class="summary-card"><strong>🛒 Shopify</strong><div class="file-meta" style="margin-top:6px;">Aún sin datos en vivo. Configura SHOPIFY_STORE y SHOPIFY_TOKEN en el backend. ${sh && sh.error ? escapeHtml(sh.error) : ''}</div></div>`;
  }

  if (mt && !mt.error) {
    html += `
      <div class="summary-card">
        <strong>📣 Meta Ads · hoy</strong>
        <div class="biz-stats">
          <div class="biz-stat"><span class="biz-num">${escapeHtml(mt.spend_fmt || String(mt.spend ?? 0))}</span><span class="biz-lbl">gasto en anuncios</span></div>
        </div>
      </div>`;
  } else {
    html += `<div class="summary-card"><strong>📣 Meta Ads</strong><div class="file-meta" style="margin-top:6px;">Aún sin datos en vivo. Configura META_TOKEN y META_AD_ACCOUNT en el backend. ${mt && mt.error ? escapeHtml(mt.error) : ''}</div></div>`;
  }

  html += `
    <a class="file-row" href="https://admin.shopify.com" target="_blank" rel="noopener"><div><div class="file-name">Shopify Admin</div></div><div class="file-open">Abrir →</div></a>
    <a class="file-row" href="https://adsmanager.facebook.com/adsmanager" target="_blank" rel="noopener"><div><div class="file-name">Meta Ads Manager</div></div><div class="file-open">Abrir →</div></a>
    <a class="file-row" href="https://business.facebook.com" target="_blank" rel="noopener"><div><div class="file-name">Meta Business Suite</div></div><div class="file-open">Abrir →</div></a>`;
  panelBody.innerHTML = html;
}

function renderEvaluacionesPanel() {
  openPanel('Próximas evaluaciones');
  const data = extra.evaluaciones;
  if (!data || !data.items || !data.items.length) {
    panelBody.innerHTML = pendingBlock('Todavía no hay evaluaciones detectadas desde Gmail. Esto se actualiza automáticamente cuando se sincronice el correo.');
    return;
  }
  const order = { alta: 0, media: 1, baja: 2 };
  const sorted = [...data.items].sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
  const syncedNote = data.lastSynced ? `<div class="file-meta" style="margin-bottom:10px;">Última sincronización: ${escapeHtml(data.lastSynced)}</div>` : '';
  panelBody.innerHTML = syncedNote + sorted.map(item => `
    <div class="evalu-item">
      <span class="pill ${priorityClass(item.priority)}">${escapeHtml(item.priority || 'media')}</span>
      <div><strong>${escapeHtml(item.subject)}</strong> — ${escapeHtml(item.title)}</div>
      <div class="file-meta">${escapeHtml(item.date || '')} · fuente: ${escapeHtml(item.source || 'gmail')}</div>
      ${item.detail ? `<div class="file-meta" style="margin-top:4px;">${escapeHtml(item.detail)}</div>` : ''}
    </div>
  `).join('');
}

function priorityClass(p) {
  if (p === 'alta') return 'priority-high';
  if (p === 'baja') return 'priority-low';
  return 'priority-mid';
}

function renderResumenPanel() {
  openPanel('Resumen semanal');
  const data = extra.resumen;
  if (!data || !data.weekOf) {
    panelBody.innerHTML = pendingBlock('Aún no se ha generado el primer resumen semanal. Se genera automáticamente cada semana y también llega a tu correo (como borrador).');
    return;
  }
  panelBody.innerHTML = `
    <div class="summary-card">
      <div class="file-meta">Semana del ${escapeHtml(data.weekOf)}</div>
      <div style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(data.summary || '')}</div>
    </div>
  `;
}

function renderAvisosPanel() {
  openPanel('Configurar avisos');
  const saved = JSON.parse(localStorage.getItem('udp_hub_avisos') || '{}');
  const day = saved.day || 'domingo';
  const time = saved.time || '19:00';
  const channel = saved.channel || 'correo';
  panelBody.innerHTML = `
    <div class="config-row"><span>Día</span>
      <select id="cfgDay">
        ${['lunes','martes','miércoles','jueves','viernes','sábado','domingo'].map(d =>
          `<option value="${d}" ${d === day ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
    </div>
    <div class="config-row"><span>Hora</span><input id="cfgTime" type="time" value="${time}" /></div>
    <div class="config-row"><span>Aviso por</span>
      <select id="cfgChannel">
        <option value="correo" ${channel === 'correo' ? 'selected' : ''}>Correo (borrador Gmail)</option>
        <option value="pagina" ${channel === 'pagina' ? 'selected' : ''}>Solo en esta página</option>
        <option value="ambos" ${channel === 'ambos' ? 'selected' : ''}>Ambos</option>
      </select>
    </div>
    <button class="save-btn" id="cfgSave">Guardar preferencia</button>
    <div class="file-meta" style="margin-top:10px;">Esto guarda tu preferencia en este dispositivo. Para que el resumen se genere a esa hora, avísale a Claude el día/hora elegido.</div>
  `;
  document.getElementById('cfgSave').addEventListener('click', () => {
    localStorage.setItem('udp_hub_avisos', JSON.stringify({
      day: document.getElementById('cfgDay').value,
      time: document.getElementById('cfgTime').value,
      channel: document.getElementById('cfgChannel').value,
    }));
    document.getElementById('cfgSave').textContent = 'Guardado ✓';
    setTimeout(() => { document.getElementById('cfgSave').textContent = 'Guardar preferencia'; }, 1500);
  });
}

function renderJarvisPanel(n) {
  openPanel('Jarvis');
  panelBody.innerHTML = `
    <div class="summary-card">
      <strong>El chat de Jarvis está siempre arriba ↑</strong>
      <div class="file-meta" style="margin-top:8px;">Escríbele desde la barra superior en cualquier momento.</div>
    </div>
  `;
}

function renderPlaceholderPanel(n) {
  openPanel(n.label);
  panelBody.innerHTML = pendingBlock(n.note || 'Próximamente.');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[s]));
}

/* ============================================================
   EDICION DE BURBUJAS (crear / editar / eliminar / mover / enlaces)
   Persiste el grafo en localStorage. Sin backend.
   ============================================================ */
const GRAPH_KEY = 'udp_hub_graph_v2';

function applyGraphOverrides(base) {
  try {
    const saved = localStorage.getItem(GRAPH_KEY);
    if (saved) { const g = JSON.parse(saved); if (g && g.nodes && g.root) base = g; }
  } catch (e) {}
  const root = base.nodes && base.nodes[base.root];
  if (root && Array.isArray(root.children)) root.children = root.children.filter(id => id !== 'jarvis');
  return base;
}

function saveGraph() {
  try { localStorage.setItem(GRAPH_KEY, JSON.stringify(graph)); } catch (e) {}
}

function genId() {
  return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
}

function openEditMenu(id, parentId) {
  const nd = node(id);
  if (!nd) return;
  const isRoot = (id === graph.root);
  openPanel('Editar burbuja');
  panelBody.innerHTML = `
    <div class="edit-form">
      <label class="edit-label">Nombre</label>
      <input id="edName" class="edit-input" type="text" value="${escapeHtml(nd.label || '')}" />
      <label class="edit-label">Icono (emoji)</label>
      <input id="edIcon" class="edit-input" type="text" maxlength="4" value="${escapeHtml(nd.icon || '')}" />
      <label class="edit-label">Enlace (URL) — opcional</label>
      <input id="edUrl" class="edit-input" type="text" placeholder="https://… (vacío = carpeta normal)" value="${escapeHtml(nd.url || '')}" />
      <button class="save-btn" id="edSave">Guardar cambios</button>
      ${parentId ? `<div class="edit-actions">
        <button class="edit-act" id="edUp">↑ Subir</button>
        <button class="edit-act" id="edDown">↓ Bajar</button>
      </div>` : ''}
      <button class="edit-act" id="edNew">＋ Crear nueva burbuja aquí</button>
      ${isRoot ? '' : '<button class="edit-act danger" id="edDel">🗑 Eliminar</button>'}
    </div>
  `;
  document.getElementById('edSave').addEventListener('click', () => {
    const nm = document.getElementById('edName').value.trim();
    const ic = document.getElementById('edIcon').value.trim();
    const ur = document.getElementById('edUrl').value.trim();
    if (nm) nd.label = nm;
    if (ic) nd.icon = ic;
    if (ur) { nd.type = 'link'; nd.url = ur; }
    else if (nd.type === 'link') { nd.type = 'group'; delete nd.url; if (!Array.isArray(nd.children)) nd.children = []; }
    saveGraph();
    closePanel();
    renderCurrentNode(false);
  });
  document.getElementById('edNew').addEventListener('click', () => createBubble());
  const up = document.getElementById('edUp');
  const dn = document.getElementById('edDown');
  if (up) up.addEventListener('click', () => moveBubble(parentId, id, -1));
  if (dn) dn.addEventListener('click', () => moveBubble(parentId, id, 1));
  const del = document.getElementById('edDel');
  if (del) del.addEventListener('click', () => deleteBubble(parentId, id));
}

function createBubble() {
  const pid = history[history.length - 1];
  const p = node(pid);
  if (!p) return;
  const name = prompt('Nombre de la nueva burbuja:', 'Nueva');
  if (name === null) return;
  let icon = prompt('Icono (emoji):', '📁');
  if (icon === null) icon = '📁';
  const url = prompt('¿Enlace (URL)? Déjalo vacío para una carpeta normal:', '');
  const id = genId();
  if (url && url.trim()) {
    graph.nodes[id] = { label: name.trim() || 'Nueva', icon: icon.trim() || '🔗', type: 'link', url: url.trim() };
  } else {
    graph.nodes[id] = { label: name.trim() || 'Nueva', icon: icon.trim() || '📁', type: 'group', children: [] };
  }
  if (!Array.isArray(p.children)) p.children = [];
  p.children.push(id);
  saveGraph();
  closePanel();
  renderCurrentNode(true);
}

function deleteBubble(parentId, id) {
  const p = node(parentId);
  if (!p || !Array.isArray(p.children)) { closePanel(); return; }
  if (!confirm('¿Eliminar esta burbuja y todo su contenido?')) return;
  p.children = p.children.filter(c => c !== id);
  delete graph.nodes[id];
  saveGraph();
  closePanel();
  if (history[history.length - 1] === id) history.pop();
  renderCurrentNode(true);
}

function moveBubble(parentId, id, dir) {
  const p = node(parentId);
  if (!p || !Array.isArray(p.children)) return;
  const i = p.children.indexOf(id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= p.children.length) return;
  const tmp = p.children[i];
  p.children[i] = p.children[j];
  p.children[j] = tmp;
  saveGraph();
  closePanel();
  renderCurrentNode(true);
}

/* ============================================================
   JARVIS — chat arriba, conectado al backend (Claude)
   ============================================================ */
function initJarvis() {
  const root = document.getElementById('jarvis');
  const form = document.getElementById('jarvisForm');
  const fieldEl = document.getElementById('jarvisField');
  const msgs = document.getElementById('jarvisMessages');
  const toggle = document.getElementById('jarvisToggle');
  if (!root || !form || !fieldEl || !msgs) return;

  const convo = [];

  function addMessage(text, who) {
    const el = document.createElement('div');
    el.className = 'msg ' + who;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  addMessage('Hola Vicente. Soy Jarvis. Pregúntame lo que quieras sobre tus ramos o tu negocio.', 'bot');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = fieldEl.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    fieldEl.value = '';

    const typing = addMessage('Jarvis está pensando…', 'bot');
    typing.classList.add('typing');

    try {
      const res = await fetch(BACKEND + '/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: convo.slice(-10) }),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok || data.error) {
        addMessage('Ups, no pude responder ahora. ' + (data.error || ('HTTP ' + res.status)), 'bot');
        return;
      }
      const reply = data.reply || '(sin respuesta)';
      addMessage(reply, 'bot');
      convo.push({ role: 'user', content: text });
      convo.push({ role: 'assistant', content: reply });
    } catch (err) {
      typing.remove();
      addMessage('No me pude conectar con el servidor. Revisa tu conexión.', 'bot');
    }
  });

  toggle.addEventListener('click', () => {
    const collapsed = root.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '▸' : '▾';
    toggle.setAttribute('aria-label', collapsed ? 'Abrir chat' : 'Minimizar chat');
  });
}

/* ============================================================
   RELOJ — hora y fecha (zona horaria de Santiago, Chile)
   ============================================================ */
function initClock() {
  const tEl = document.getElementById('clockTime');
  const dEl = document.getElementById('clockDate');
  if (!tEl || !dEl) return;
  const TZ = 'America/Santiago';
  function tick() {
    const now = new Date();
    tEl.textContent = now.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    dEl.textContent = now.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' });
  }
  tick();
  setInterval(tick, 1000);
}
