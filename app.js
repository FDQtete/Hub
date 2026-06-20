// UDP Hub — bubble navigation
// Generic node-graph engine: data/graph.json defines the tree of bubbles
// (root -> groups -> courses/panels). New top-level areas (Negocios, Finanzas,
// Tareas, Jarvis, etc.) are added by editing graph.json — no app.js changes needed
// unless they need a brand-new panel type.
//
// Data sources:
//   data/graph.json        -> navigation tree (which bubbles exist, in what order)
//   data/manifest.json     -> course files (Notes/Assignments/Exams/Syllabus per course)
//   data/canvas.json       -> Canvas courses/assignments (filled once the Canvas API is wired up)
//   data/evaluaciones.json -> upcoming evaluations synced from Gmail
//   data/resumen.json      -> weekly summary (filled by the scheduled task)

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

let graph = null;       // { root, nodes: { id: {label, icon, type, children?, slug?, note?} } }
let manifest = null;    // { courses: [...] }
let extra = { canvas: null, evaluaciones: null, resumen: null };
let history = [];       // stack of node ids for the bubble-ring views (not panels)

const CAT_ICON_FALLBACK = '📁';

init();

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

  history = [graph.root];
  renderCurrentNode();

  window.addEventListener('resize', () => renderCurrentNode());
  backBtn.addEventListener('click', goBack);
  centerBubble.addEventListener('click', () => {
    if (history.length > 1) { history = [graph.root]; renderCurrentNode(); }
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
  renderCurrentNode();
}

// Returns the list of {id, label, icon, count?} bubbles to show for a node.
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

function renderCurrentNode() {
  const id = history[history.length - 1];
  const n = node(id);
  if (!n) return;

  crumbTitle.textContent = n.label;
  backBtn.classList.toggle('hidden', history.length <= 1);
  closePanel();
  setCenter(n.icon, n.label);
  clearField();

  const items = childItems(n);
  if (!items.length && n.type && n.type.startsWith('panel:')) {
    // Leaf node reached directly off another ring — shouldn't normally happen
    // since panels open on click before we get here, but guard anyway.
    openPanelForNode(id, n);
    return;
  }

  layoutRing(items, (item, el) => {
    if (item.count !== undefined) el.classList.add('badge'), el.setAttribute('data-badge', item.count);
    el.addEventListener('click', () => onBubbleClick(item, n));
  }, history.length === 1 ? 'main' : 'sub');
}

function onBubbleClick(item, parentNode) {
  if (item.categoryRef) {
    openCategoryPanel(item.courseRef, item.categoryRef);
    return;
  }
  const childNode = node(item.id);
  if (!childNode) return;

  if (childNode.type === 'group' || childNode.type === 'course') {
    history.push(item.id);
    renderCurrentNode();
  } else if (childNode.type && childNode.type.startsWith('panel:')) {
    openPanelForNode(item.id, childNode);
  }
}

function setCenter(icon, label) {
  centerBubble.querySelector('.bubble-icon').textContent = icon;
  centerBubble.querySelector('.bubble-label').textContent = label;
}

function clearField() {
  field.innerHTML = '';
  linesSvg.innerHTML = '';
}

function layoutRing(items, bind, sizeClass) {
  const rect = stage.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height * 0.42;
  const radius = Math.min(rect.width, rect.height) * (sizeClass === 'main' ? 0.34 : 0.30);

  items.forEach((item, i) => {
    const angle = (-90 + (360 / items.length) * i) * (Math.PI / 180);
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    const el = document.createElement('div');
    el.className = `bubble ${sizeClass}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transform = 'translate(-50%, -50%)';
    el.innerHTML = `<span class="bubble-icon">${item.icon}</span><span class="bubble-label">${item.label}</span>`;
    field.appendChild(el);
    bind(item, el);

    drawLine(cx, cy, x, y);
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

function openPanel(title) {
  panelTitle.textContent = title;
  panel.classList.remove('hidden');
}

function closePanel() {
  panel.classList.add('hidden');
  panelBody.innerHTML = '';
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

// Dispatches a node's panel:* type to its renderer.
function openPanelForNode(id, n) {
  if (n.type === 'panel:canvas') return renderCanvasPanel();
  if (n.type === 'panel:evaluaciones') return renderEvaluacionesPanel();
  if (n.type === 'panel:resumen') return renderResumenPanel();
  if (n.type === 'panel:avisos') return renderAvisosPanel();
  if (n.type === 'panel:jarvis') return renderJarvisPanel(n);
  if (n.type === 'panel:placeholder') return renderPlaceholderPanel(n);
}

function pendingBlock(msg) {
  return `<div class="empty-state">${msg}</div>`;
}

function renderCanvasPanel() {
  openPanel('Canvas');
  const data = extra.canvas;
  if (!data || data.status === 'pending_setup') {
    panelBody.innerHTML = pendingBlock('Canvas todavía no está conectado en vivo. El dominio (udp.instructure.com) está bloqueado para conexiones directas desde este entorno — necesita un pequeño servidor intermedio (function serverless) que guarde el token de forma segura. En cuanto esté desplegado, aquí aparecerán tus cursos y tareas próximas.');
    return;
  }
  const courses = data.courses || [];
  if (!courses.length) {
    panelBody.innerHTML = pendingBlock('No hay tareas próximas en Canvas por ahora.');
    return;
  }
  panelBody.innerHTML = courses.map(c => `
    <div class="summary-card">
      <strong>${escapeHtml(c.name)}</strong>
      ${(c.assignments || []).map(a => `
        <div class="evalu-item" style="margin-top:8px;">
          <div>${escapeHtml(a.name)}</div>
          <div class="file-meta">Vence: ${escapeHtml(a.due_at || 'sin fecha')}</div>
        </div>
      `).join('') || '<div class="file-meta">Sin tareas pendientes</div>'}
    </div>
  `).join('');
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
    panelBody.innerHTML = pendingBlock('Aún no se ha generado el primer resumen semanal. Se genera automáticamente cada semana y también llega a tu correo (como borrador, ya que la cuenta conectada solo permite redactar borradores, no enviar correos directamente).');
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
    <div class="config-row">
      <span>Día</span>
      <select id="cfgDay">
        ${['lunes','martes','miércoles','jueves','viernes','sábado','domingo'].map(d =>
          `<option value="${d}" ${d === day ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
    </div>
    <div class="config-row">
      <span>Hora</span>
      <input id="cfgTime" type="time" value="${time}" />
    </div>
    <div class="config-row">
      <span>Aviso por</span>
      <select id="cfgChannel">
        <option value="correo" ${channel === 'correo' ? 'selected' : ''}>Correo (borrador Gmail)</option>
        <option value="pagina" ${channel === 'pagina' ? 'selected' : ''}>Solo en esta página</option>
        <option value="ambos" ${channel === 'ambos' ? 'selected' : ''}>Ambos</option>
      </select>
    </div>
    <button class="save-btn" id="cfgSave">Guardar preferencia</button>
    <div class="file-meta" style="margin-top:10px;">
      Esto guarda tu preferencia en este dispositivo. Para que el resumen semanal realmente se genere a esa hora,
      avísale a Claude en el chat el día/hora que elegiste así se crea o actualiza la tarea programada.
    </div>
  `;

  document.getElementById('cfgSave').addEventListener('click', () => {
    const value = {
      day: document.getElementById('cfgDay').value,
      time: document.getElementById('cfgTime').value,
      channel: document.getElementById('cfgChannel').value,
    };
    localStorage.setItem('udp_hub_avisos', JSON.stringify(value));
    document.getElementById('cfgSave').textContent = 'Guardado ✓';
    setTimeout(() => { document.getElementById('cfgSave').textContent = 'Guardar preferencia'; }, 1500);
  });
}

function renderJarvisPanel(n) {
  openPanel('Jarvis');
  panelBody.innerHTML = `
    <div class="summary-card">
      <strong>Jarvis todavía no tiene chat en vivo.</strong>
      <div class="file-meta" style="margin-top:8px;">${escapeHtml(n.note || '')}</div>
    </div>
    <div class="empty-state" style="text-align:left; padding-left:4px;">
      Para que Jarvis converse de verdad (texto y luego voz) sin exponer ninguna clave en el sitio público,
      necesita un pequeño backend propio que reciba tu mensaje, llame a la API de forma segura desde el servidor,
      y devuelva la respuesta. La voz se agrega después con el reconocimiento de voz del navegador — no requiere
      nada nuevo del lado del servidor. Cuéntame cuándo quieres que avancemos con esa pieza.
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
