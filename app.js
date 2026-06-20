// UDP Hub — navegacion por burbujas (con backend: Canvas + Jarvis)
// data/graph.json define el arbol de burbujas. Jarvis vive como chat arriba.
// Backend (Cloudflare Worker) sirve Canvas en vivo y las respuestas de Jarvis.

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

// URL del backend (Cloudflare Worker) que sirve Canvas y Jarvis.
const BACKEND = 'https://hub.vicentevargasblanco.workers.dev';

init();
initEarth();
initJarvis();

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
    return n.children.map(id => ({ id, label: node(id)?.label || id, icon: node(id)?.icon || '•' }));
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
   EDICION DE BURBUJAS (crear / editar / eliminar / mover)
   Persiste el grafo en localStorage. Sin backend.
   ============================================================ */
const GRAPH_KEY = 'udp_hub_graph_v1';

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
    if (nm) nd.label = nm;
    if (ic) nd.icon = ic;
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
  const id = genId();
  graph.nodes[id] = { label: name.trim() || 'Nueva', icon: icon.trim() || '📁', type: 'group', children: [] };
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
   FONDO: Tierra nocturna rotando con luces de ciudades (canvas)
   ============================================================ */
function initEarth() {
  const canvas = document.getElementById('earth');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1;
  let stars = [];
  let cities = [];
  let rot = 0;
  let zoom = 1, zoomBase = 1, zoomPulse = 0;
  const tilt = -0.36;

  window.__earth = {
    setDepth(d) { zoomBase = 1 + Math.min(Math.max(d - 1, 0), 3) * 0.13; },
    pulse() { zoomPulse = 0.14; },
  };

  const CLUSTERS = [
    [2, 48, 40], [0, 52, 24], [12, 45, 18], [24, 45, 14], [37, 55, 22],
    [31, 30, 16], [35, 32, 14], [45, 30, 12], [55, 25, 10],
    [78, 22, 46], [88, 24, 24], [73, 19, 18], [100, 14, 16],
    [116, 32, 44], [120, 30, 20], [108, 23, 16], [135, 35, 30], [127, 37, 14],
    [106, 11, 18], [110, -7, 22], [121, 14, 12],
    [3, 8, 16], [8, 5, 10], [28, -26, 12], [36, -1, 8],
    [-77, 39, 30], [-87, 41, 16], [-95, 30, 16], [-118, 34, 22], [-122, 38, 12],
    [-99, 19, 24], [-74, 5, 10], [-58, -34, 16], [-46, -23, 22], [-43, -23, 12],
    [-70, -33, 10], [151, -33, 16], [145, -38, 10], [174, -37, 6],
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

  function buildCities() {
    cities = [];
    CLUSTERS.forEach(([lon, lat, weight]) => {
      const n = Math.round(weight * 1.1);
      for (let i = 0; i < n; i++) {
        cities.push({
          lon: (lon + gauss() * 9) * Math.PI / 180,
          lat: (lat + gauss() * 6) * Math.PI / 180,
          b: rand(0.45, 1),
          tw: Math.random() * Math.PI * 2,
        });
      }
    });
    for (let i = 0; i < 140; i++) {
      cities.push({
        lon: rand(-180, 180) * Math.PI / 180,
        lat: Math.asin(rand(-1, 1)),
        b: rand(0.15, 0.4),
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function buildStars() {
    stars = [];
    const count = Math.round((W * H) / 7000);
    for (let i = 0; i < count; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.2, a: rand(0.2, 0.8), tw: Math.random() * Math.PI * 2 });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
    if (!cities.length) buildCities();
  }

  function draw(t) {
    const time = t * 0.001;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      const a = s.a * (0.6 + 0.4 * Math.sin(time * 1.5 + s.tw));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#cfd6e6';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const zTarget = zoomBase + zoomPulse;
    zoom += (zTarget - zoom) * 0.08;
    zoomPulse *= 0.90;

    const cx = W * 0.74, cy = H * 0.5, R = Math.min(W, H) * 0.46 * zoom;

    const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.28);
    halo.addColorStop(0, 'rgba(255, 140, 43, 0.12)');
    halo.addColorStop(0.5, 'rgba(255, 120, 40, 0.05)');
    halo.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2); ctx.fill();

    const sphere = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    sphere.addColorStop(0, '#0b1320'); sphere.addColorStop(0.6, '#070b13'); sphere.addColorStop(1, '#02040a');
    ctx.fillStyle = sphere;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    for (const c of cities) {
      const lambda = c.lon + rot;
      const cosLat = Math.cos(c.lat);
      let x = cosLat * Math.sin(lambda);
      let y = Math.sin(c.lat);
      let z = cosLat * Math.cos(lambda);
      const y2 = y * cosT - z * sinT;
      const z2 = y * sinT + z * cosT;
      y = y2; z = z2;
      if (z <= 0.02) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      const depth = Math.pow(z, 0.6);
      const tw = 0.75 + 0.25 * Math.sin(time * 2 + c.tw);
      const alpha = Math.min(1, c.b * depth * tw);
      const size = 0.6 + c.b * 1.4;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2.4);
      g.addColorStop(0, `rgba(255, 214, 150, ${alpha})`);
      g.addColorStop(0.4, `rgba(255, 160, 70, ${alpha * 0.8})`);
      g.addColorStop(1, 'rgba(255, 130, 40, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, size * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    const edge = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = edge;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(255, 170, 90, 0.18)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, Math.PI * 2); ctx.stroke();

    if (!prefersReduced) rot += 0.0016;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
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

  const convo = []; // historial {role, content} para contexto

  function addMessage(text, who) {
    const el = document.createElement('div');
    el.className = 'msg ' + who;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  addMessage('Hola Vicente. Soy Jarvis. Pregúntame lo que quieras sobre tus ramos.', 'bot');

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
