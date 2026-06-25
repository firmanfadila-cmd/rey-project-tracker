/* ── AUTH ───────────────────────────────────────────────── */
const TOKEN_KEY = 'rey_token';
const USER_KEY  = 'rey_user';

function getToken()   { return localStorage.getItem(TOKEN_KEY); }
function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  location.href = '/index.html';
}

async function api(method, path, body) {
  try {
    const res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { logout(); return null; }
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { data: null, error: `Server error (${res.status})` }; }
  } catch (err) {
    console.error('api()', method, path, err);
    return { data: null, error: 'Network error — check connection' };
  }
}

/* ── CONSTANTS ──────────────────────────────────────────── */
const STATUS_COLOR = { hot:'#ff6b6b', active:'#4da3ff', poc:'#ffd166', v2:'#b594f8', done:'#2dd4a7' };
const TASK_STATUS = {
  'not-started': { label:'Not Started', color:'#3f607e',  bg:'rgba(63,96,126,0.22)'  },
  'in-progress': { label:'In Progress', color:'#4da3ff',  bg:'rgba(77,163,255,0.14)' },
  'completed':   { label:'Completed',   color:'#2dd4a7',  bg:'rgba(45,212,167,0.14)' },
  'delayed':     { label:'Delayed',     color:'#ff6b6b',  bg:'rgba(255,107,107,0.14)'},
  'on-hold':     { label:'On Hold',     color:'#ffd166',  bg:'rgba(255,209,102,0.14)'},
};
const TAG_CLASS = { 'Olvo Claims':'tag-claims','Olvo UW':'tag-uw','Platform':'tag-platform' };
const CAT_MAP   = { 'Olvo Claims':'claims','Olvo UW':'uw','Platform':'platform','Analytics':'other' };
const PALETTE   = ['#1565c0','#2e7d32','#6a1b9a','#bf360c','#e65100','#00695c','#1a6eb5','#b71c1c'];

/* ── STATE ──────────────────────────────────────────────── */
let STATE          = [];       // array of project objects (tasks loaded on demand)
let currentView    = 'list';
let activeProjectId= null;
let editingTimeline= false;
let editingInfo    = false;
let editingTaskId  = null;
let showAddForm    = false;
let activeFilter   = 'all';

/* ── HELPERS ────────────────────────────────────────────── */
function getProj(id) { return STATE.find(p => p.id === id); }

function normalizeProject(row) {
  const status   = row.status || 'active';
  const product  = row.product || 'Olvo Claims';
  const badgeMap = { hot:'Hot',active:'Active',poc:'POC',v2:'V2 Dev',done:'Completed' };
  return {
    ...row,
    planStart:   row.plan_start   || null,
    planEnd:     row.plan_end     || null,
    actualStart: row.actual_start || null,
    actualEnd:   row.actual_end   || null,
    monoColor:   row.mono_color   || '#1a6eb5',
    category:    CAT_MAP[product] || 'other',
    badge:       row.badge || badgeMap[status] || 'Active',
    urgent:      status === 'hot' || status === 'v2',
    tasks:       row.tasks || [],
  };
}

function normalizeTask(row) {
  return {
    ...row,
    planStart:   row.plan_start   || '',
    planEnd:     row.plan_end     || '',
    actualStart: row.actual_start || null,
    actualEnd:   row.actual_end   || null,
    progress:    row.progress     || 0,
    status:      row.status       || 'not-started',
    remarks:     row.remarks      || '',
  };
}

function daysFrom(base, d) {
  if (!d || !base) return null;
  return Math.round((new Date(d+'T00:00:00') - new Date(base+'T00:00:00')) / 86400000);
}
function daysSpan(s, e) {
  if (!s || !e) return null;
  return Math.round((new Date(e+'T00:00:00') - new Date(s+'T00:00:00')) / 86400000) + 1;
}
function fmtShort(s) {
  if (!s) return '—';
  return new Date(s+'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}
function fmtFull(s) {
  if (!s) return '—';
  return new Date(s+'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function todayISO() { return new Date().toISOString().slice(0,10); }
function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function projProgress(p) {
  if (!p.tasks || !p.tasks.length) return { pct:0, done:0, total:0 };
  const pct  = Math.round(p.tasks.reduce((s,t) => s+(t.progress||0), 0) / p.tasks.length);
  const done = p.tasks.filter(t => t.status==='completed').length;
  return { pct, done, total:p.tasks.length };
}

/* ── DATA LOADING ───────────────────────────────────────── */
async function loadProjects() {
  const json = await api('GET', '/projects');
  if (!json) return;
  if (json.error) throw new Error(json.error);
  STATE = (json.data || []).map(normalizeProject);
}

async function loadTasksForProject(projectId) {
  const json = await api('GET', `/projects/${projectId}/tasks`);
  if (!json || json.error) return [];
  return json.data.map(normalizeTask);
}

/* ── STATS BAR ──────────────────────────────────────────── */
function renderStats() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;
  bar.innerHTML = '';
  [
    { color:'#4da3ff', num:STATE.filter(p=>p.status!=='done').length,                lbl:'Active Projects' },
    { color:'#4da3ff', num:STATE.filter(p=>p.category==='claims').length,             lbl:'Olvo Claims' },
    { color:'#b594f8', num:STATE.filter(p=>p.category==='uw').length,                 lbl:'Olvo UW' },
    { color:'#ff6b6b', num:STATE.filter(p=>p.status==='hot'||p.status==='v2').length, lbl:'Urgent' },
    { color:'#2dd4a7', num:STATE.filter(p=>p.status==='done').length,                 lbl:'Completed' },
  ].forEach(s => {
    const el = document.createElement('div');
    el.className = 'stat-pill';
    el.innerHTML = `<div class="stat-dot" style="background:${s.color}"></div><span class="stat-num">${s.num}</span><span class="stat-lbl">${s.lbl}</span>`;
    bar.appendChild(el);
  });
}

/* ── GRID ───────────────────────────────────────────────── */
function renderGrid() {
  const grid = document.getElementById('grid');
  const noR  = document.getElementById('no-results');
  if (!grid) return;
  grid.querySelectorAll('.card, .loading-wrap').forEach(c => c.remove());

  STATE.forEach((p, i) => {
    const prog   = projProgress(p);
    const color  = STATUS_COLOR[p.status] || '#4da3ff';
    const tagCls = TAG_CLASS[p.product] || '';
    const isAdmin = getCurrentUser()?.role === 'admin';

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.status   = p.status;
    card.dataset.category = p.category;
    card.style.animationDelay = `${0.05 + i * 0.05}s`;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-identity">
          <div class="monogram" style="background:${p.monoColor}">${esc(p.mono||'?')}</div>
          <div><div class="client-name">${esc(p.client)}</div><div class="client-sub">${esc(p.sub||'')}</div></div>
        </div>
        <div class="status-badge badge-${p.status}">
          <div class="status-dot" style="background:${color}"></div>${esc(p.badge)}
        </div>
      </div>
      <div class="card-project">${esc(p.project)}</div>
      <div class="card-tags">
        <span class="tag ${tagCls}">${esc(p.product||'')}</span>
        <span class="tag">${esc(p.phase||'—')}</span>
      </div>
      <div class="divider"></div>
      <div class="card-row"><span class="row-lbl">DL</span><span class="row-val ${p.urgent?'urgent':''}">${esc(p.deadline||'—')}</span></div>
      <div class="card-row"><span class="row-lbl">NEXT</span><span class="row-val primary">${esc(p.next||'—')}</span></div>
      <div class="card-row"><span class="row-lbl">PM</span><span class="row-val">${esc(p.pm||'—')}</span></div>
      <div class="card-row"><span class="row-lbl">REV</span><span class="row-val revenue">${esc(p.revenue||'—')}</span></div>
      <div class="progress-wrap">
        <div class="progress-header">
          <span class="progress-lbl">Tasks ${prog.done}/${prog.total}</span>
          <span class="progress-count">${prog.pct}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${prog.pct}%;background:${color}"></div></div>
      </div>
      ${isAdmin ? `<button class="card-del" title="Delete project">🗑</button>` : ''}`;

    card.addEventListener('click', () => showDetail(p.id));
    if (isAdmin) {
      card.querySelector('.card-del').addEventListener('click', e => {
        e.stopPropagation();
        deleteProject(p.id);
      });
    }
    grid.insertBefore(card, noR);
  });

  applyFilter(activeFilter);
}

function applyFilter(f) {
  activeFilter = f;
  const noR = document.getElementById('no-results');
  let vis = 0;
  document.querySelectorAll('.card').forEach(card => {
    const show = f==='all' ? true : f==='claims' ? card.dataset.category==='claims'
      : f==='uw' ? card.dataset.category==='uw' : f==='platform' ? card.dataset.category==='platform'
      : f==='done' ? card.dataset.status==='done' : false;
    card.classList.toggle('hidden', !show);
    if (show) vis++;
  });
  if (noR) noR.classList.toggle('visible', vis===0);
}

/* ── VIEW SWITCHING ─────────────────────────────────────── */
async function showDetail(projectId) {
  activeProjectId  = projectId;
  editingTimeline  = false;
  editingInfo      = false;
  editingTaskId    = null;
  showAddForm      = false;
  currentView      = 'detail';
  document.getElementById('view-list').style.display   = 'none';
  document.getElementById('view-detail').style.display = 'block';

  const p = getProj(projectId);
  if (p && !p._tasksLoaded) {
    p.tasks = await loadTasksForProject(projectId);
    p._tasksLoaded = true;
  }
  renderDetail();
  window.scrollTo(0, 0);
}

function showList() {
  currentView = 'list';
  document.getElementById('view-list').style.display   = 'block';
  document.getElementById('view-detail').style.display = 'none';
  activeProjectId = null;
}

/* ── DETAIL VIEW ────────────────────────────────────────── */
function renderDetail() {
  const p = getProj(activeProjectId);
  if (!p) return;
  document.getElementById('view-detail').innerHTML = buildDetail(p);
}

function buildDetail(p) {
  const color  = STATUS_COLOR[p.status] || '#4da3ff';
  const tasks  = p.tasks || [];
  const today  = todayISO();
  const prog   = projProgress(p);
  const isAdmin = getCurrentUser()?.role === 'admin';

  const planD    = daysSpan(p.planStart, p.planEnd);
  const actD     = p.actualStart ? daysSpan(p.actualStart, p.actualEnd || today) : null;
  const variance = (planD && actD) ? actD - planD : null;
  const varBadge = variance===null ? ''
    : variance>0  ? `<span class="var-badge var-over">+${variance}d over</span>`
    : variance<0  ? `<span class="var-badge var-under">${Math.abs(variance)}d ahead</span>`
    :                `<span class="var-badge var-on">On track</span>`;

  let html = `
    <div class="detail-header">
      <button class="btn-back" onclick="showList()">← Back</button>
      <div class="monogram" style="background:${p.monoColor};width:44px;height:44px;border-radius:11px;font-size:12px;flex-shrink:0">${esc(p.mono||'?')}</div>
      <div class="detail-identity">
        <div class="detail-client">${esc(p.client)} · ${esc(p.product||'')}</div>
        <div class="detail-title">${esc(p.project)}</div>
        <div class="detail-meta">
          <span><span class="meta-lbl">PM</span> ${esc(p.pm||'—')}</span>
          <span><span class="meta-lbl">Revenue</span> <span style="color:var(--done);font-weight:600">${esc(p.revenue||'—')}</span></span>
          <span><span class="meta-lbl">Phase</span> ${esc(p.phase||'—')}</span>
          <span><span class="meta-lbl">Progress</span> ${prog.pct}%</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div class="status-badge badge-${p.status}">
          <div class="status-dot" style="background:${color}"></div>${esc(p.badge)}
        </div>
        <button class="btn-icon" onclick="toggleInfo()" title="${editingInfo?'Cancel edit':'Edit project info'}"
          style="${editingInfo?'border-color:var(--accent);color:var(--accent);background:rgba(77,163,255,0.1)':''}">
          ${editingInfo ? '×' : '✎'}
        </button>
        ${isAdmin ? `<button class="btn-icon" onclick="deleteProject('${p.id}')" title="Delete project"
          style="border-color:rgba(255,107,107,0.25);color:var(--hot);"
          onmouseover="this.style.background='rgba(255,107,107,0.1)'"
          onmouseout="this.style.background='var(--surface)'">🗑</button>` : ''}
      </div>
    </div>
    <div class="detail-body">`;

  if (editingInfo) {
    const statusOpts = ['hot','active','poc','v2','done'].map(s =>
      `<option value="${s}"${p.status===s?' selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('');
    const productOpts = ['Olvo Claims','Olvo UW','Platform','Analytics'].map(s =>
      `<option value="${s}"${p.product===s?' selected':''}>${s}</option>`).join('');
    html += `<div class="det-section" style="background:rgba(77,163,255,0.04);border:1px solid rgba(77,163,255,0.12);border-radius:12px;padding:20px 20px 16px;margin-bottom:24px">
      <div class="det-section-hdr" style="margin-bottom:16px"><div class="det-section-title">Edit Project Info</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="tl-field form-full" style="grid-column:1/-1"><label>Project Title</label><input type="text" id="ei-project" class="tf-input" value="${esc(p.project)}" style="width:100%"></div>
        <div class="tl-field"><label>Client Name</label><input type="text" id="ei-client" class="tf-input" value="${esc(p.client)}" style="width:100%"></div>
        <div class="tl-field"><label>Sub / Location</label><input type="text" id="ei-sub" class="tf-input" value="${esc(p.sub||'')}" style="width:100%"></div>
        <div class="tl-field"><label>Product</label><select id="ei-product" class="tf-input" style="width:100%">${productOpts}</select></div>
        <div class="tl-field"><label>Phase</label><input type="text" id="ei-phase" class="tf-input" value="${esc(p.phase||'')}" style="width:100%"></div>
        <div class="tl-field"><label>Status</label><select id="ei-status" class="tf-input" style="width:100%">${statusOpts}</select></div>
        <div class="tl-field"><label>Badge Label</label><input type="text" id="ei-badge" class="tf-input" value="${esc(p.badge||'')}" style="width:100%"></div>
        <div class="tl-field"><label>Project Manager</label><input type="text" id="ei-pm" class="tf-input" value="${esc(p.pm||'')}" style="width:100%"></div>
        <div class="tl-field"><label>Potential Revenue</label><input type="text" id="ei-revenue" class="tf-input" value="${esc(p.revenue||'')}" style="width:100%"></div>
        <div class="tl-field" style="grid-column:1/-1"><label>Deadline / Date Label</label><input type="text" id="ei-deadline" class="tf-input" value="${esc(p.deadline||'')}" style="width:100%"></div>
        <div class="tl-field" style="grid-column:1/-1"><label>Next Action</label><input type="text" id="ei-next" class="tf-input" value="${esc(p.next||'')}" style="width:100%"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn-ghost" style="padding:6px 14px;font-size:12px" onclick="toggleInfo()">Cancel</button>
        <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="saveInfo()">Save Changes</button>
      </div>
    </div>`;
  }

  html += `<div class="det-section">
    <div class="det-section-hdr">
      <div class="det-section-title">Project Timeline</div>
      <button class="btn-icon" onclick="toggleTimeline()">${editingTimeline ? '×' : '✎'}</button>
    </div>`;

  if (editingTimeline) {
    html += `<div class="tl-edit-grid">
      <div class="tl-field"><label>Plan Start</label><input type="date" id="tl-ps" class="tf-input" value="${p.planStart||''}"></div>
      <div class="tl-field"><label>Plan End</label><input type="date" id="tl-pe" class="tf-input" value="${p.planEnd||''}"></div>
      <div class="tl-field"><label>Actual Start</label><input type="date" id="tl-as" class="tf-input" value="${p.actualStart||''}"></div>
      <div class="tl-field"><label>Actual End</label><input type="date" id="tl-ae" class="tf-input" value="${p.actualEnd||''}"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn-ghost" style="padding:6px 14px;font-size:12px" onclick="toggleTimeline()">Cancel</button>
      <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="saveTimeline()">Save</button>
    </div>`;
  } else {
    html += `<div class="timeline-grid">
      <div class="timeline-chip">
        <div class="tc-lbl">Plan</div>
        <div class="tc-dates">${fmtFull(p.planStart)} → ${fmtFull(p.planEnd)}</div>
        <div class="tc-days">${planD ? planD+' days' : '—'}</div>
      </div>
      <div class="timeline-chip">
        <div class="tc-lbl">Actual ${varBadge}</div>
        <div class="tc-dates">${fmtFull(p.actualStart)} → ${p.actualEnd ? fmtFull(p.actualEnd) : 'Ongoing'}</div>
        <div class="tc-days">${actD ? actD+' days' : '—'}</div>
      </div>
    </div>`;
  }
  html += `</div>`;

  html += `<div class="det-section">
    <div class="det-section-hdr"><div class="det-section-title">Tasks (${tasks.length})</div></div>`;

  if (tasks.length > 0 || (showAddForm && editingTaskId===null)) {
    html += `<div class="task-table-scroll"><table class="task-table">
      <thead><tr>
        <th>Task</th>
        <th>Plan Start</th><th>Plan End</th><th>Plan Days</th>
        <th>Actual Start</th><th>Actual End</th><th>Actual Days</th>
        <th>Progress</th><th>Status</th><th>Remarks</th>
        <th></th>
      </tr></thead><tbody>`;

    tasks.forEach(t => {
      if (editingTaskId===t.id) {
        html += taskFormRow(t, false);
      } else {
        const pd = daysSpan(t.planStart, t.planEnd);
        const ad = t.actualStart ? daysSpan(t.actualStart, t.actualEnd||today) : null;
        const ts = TASK_STATUS[t.status] || TASK_STATUS['not-started'];
        html += `<tr>
          <td><span class="task-name-cell" title="${esc(t.name)}">${esc(t.name)}</span></td>
          <td>${fmtShort(t.planStart)}</td><td>${fmtShort(t.planEnd)}</td><td>${pd||'—'}</td>
          <td>${fmtShort(t.actualStart)}</td><td>${fmtShort(t.actualEnd)}</td><td>${ad||'—'}</td>
          <td>
            <div class="t-prog-wrap">
              <div class="t-prog-track"><div class="t-prog-fill" style="width:${t.progress}%;background:${color}"></div></div>
              <span class="t-prog-pct">${t.progress}%</span>
            </div>
          </td>
          <td><span class="ts-badge" style="background:${ts.bg};color:${ts.color}">${ts.label}</span></td>
          <td><span class="t-remarks" title="${esc(t.remarks||'')}">${esc(t.remarks||'—')}</span></td>
          <td>
            <div class="t-actions">
              <button class="t-btn" onclick="startEdit('${t.id}')" title="Edit">✎</button>
              <button class="t-btn del" onclick="deleteTask('${t.id}')" title="Delete">×</button>
            </div>
          </td>
        </tr>`;
      }
    });

    if (showAddForm && editingTaskId===null) html += taskFormRow(null, true);
    html += `</tbody></table></div>`;
  } else {
    html += `<div class="task-empty">No tasks yet. Add your first task below.</div>`;
  }

  if (!showAddForm && editingTaskId===null) {
    html += `<button class="btn-add-task" onclick="openAddForm()">+ Add Task</button>`;
  }
  html += `</div>`;

  if (tasks.length > 0) {
    html += `<div class="det-section">
      <div class="det-section-hdr"><div class="det-section-title">Gantt Chart</div></div>
      ${buildGantt(tasks, color)}
    </div>`;
  }

  html += `</div>`;
  return html;
}

/* ── GANTT ──────────────────────────────────────────────── */
function buildGantt(tasks, color) {
  const today = todayISO();
  const allS  = tasks.map(t=>t.planStart).filter(Boolean);
  const allE  = tasks.map(t=>t.planEnd).filter(Boolean);
  if (!allS.length) return '';

  const rangeStart = allS.reduce((a,b)=>a<b?a:b);
  const rangeEnd   = allE.reduce((a,b)=>a>b?a:b);
  const total      = daysSpan(rangeStart, rangeEnd);
  if (!total || total<1) return '';

  const toLeft  = d => d ? Math.max(0, daysFrom(rangeStart,d)/total*100) : null;
  const toWidth = (s,e) => { if (!s||!e) return 0; return Math.max(0.4, Math.min(100, daysSpan(s,e)/total*100)); };

  let axisTicks='', axisLabels='';
  let cur = new Date(rangeStart+'T00:00:00'); cur.setDate(1);
  const endD = new Date(rangeEnd+'T00:00:00');
  while (cur<=endD) {
    const iso = cur.toISOString().slice(0,10);
    const l   = toLeft(iso);
    if (l!==null) {
      const lbl = cur.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
      axisTicks  += `<div style="position:absolute;left:${l}%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.04)"></div>`;
      axisLabels += `<div style="position:absolute;left:${l}%;transform:translateX(-50%);font-size:8.5px;font-family:'Space Mono',monospace;color:var(--text-muted);top:4px;white-space:nowrap">${lbl}</div>`;
    }
    cur.setMonth(cur.getMonth()+1);
  }

  const todayLeft = toLeft(today);
  const todayLine = (todayLeft!==null && todayLeft>=0 && todayLeft<=100)
    ? `<div style="position:absolute;left:${todayLeft}%;top:0;bottom:0;width:1.5px;background:var(--hot);opacity:0.65;z-index:3;pointer-events:none"></div>` : '';

  let rows='';
  tasks.forEach(t => {
    const ts  = TASK_STATUS[t.status] || TASK_STATUS['not-started'];
    const pl  = toLeft(t.planStart);
    const pw  = toWidth(t.planStart, t.planEnd);
    const al  = t.actualStart ? toLeft(t.actualStart) : null;
    const aw  = t.actualStart ? toWidth(t.actualStart, t.actualEnd||today) : 0;
    const planBar   = pl!==null ? `<div style="position:absolute;left:${pl}%;width:${pw}%;height:8px;border-radius:3px;background:rgba(255,255,255,0.08);top:50%;transform:translateY(-50%)"></div>` : '';
    const actualBar = al!==null ? `<div style="position:absolute;left:${al}%;width:${aw}%;height:14px;border-radius:3px;overflow:hidden;top:50%;transform:translateY(-50%);background:${ts.bg}">
        <div style="width:${t.progress}%;height:100%;background:${ts.color};opacity:0.75;border-radius:3px"></div>
      </div>` : '';
    rows += `<div style="display:grid;grid-template-columns:130px 1fr;align-items:center;height:36px;margin-bottom:2px">
      <div style="font-size:11px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:10px" title="${esc(t.name)}">${esc(t.name)}</div>
      <div style="position:relative;height:100%">${axisTicks}${planBar}${actualBar}${todayLine}</div>
    </div>`;
  });

  return `<div class="gantt-scroll"><div class="gantt-inner">
    <div style="display:grid;grid-template-columns:130px 1fr;margin-bottom:4px">
      <div></div>
      <div style="position:relative;height:24px;border-bottom:1px solid var(--border)">${axisLabels}</div>
    </div>
    ${rows}
  </div></div>
  <div class="gantt-legend">
    <div class="gantt-legend-item"><span style="display:inline-block;width:16px;height:5px;border-radius:3px;background:rgba(255,255,255,0.1)"></span> Plan</div>
    <div class="gantt-legend-item"><span style="display:inline-block;width:16px;height:10px;border-radius:3px;background:${color};opacity:0.6"></span> Actual</div>
    <div class="gantt-legend-item"><span style="display:inline-block;width:1.5px;height:12px;background:var(--hot);opacity:0.65"></span> Today</div>
  </div>`;
}

/* ── TIMELINE EDIT ──────────────────────────────────────── */
function toggleTimeline() { editingTimeline = !editingTimeline; renderDetail(); }

async function saveTimeline() {
  const p = getProj(activeProjectId);
  if (!p) return;
  const ps = document.getElementById('tl-ps')?.value;
  const pe = document.getElementById('tl-pe')?.value;
  if (!ps || !pe) { alert('Plan start and plan end are required.'); return; }

  const body = {
    ...buildProjectBody(p),
    plan_start:   ps,
    plan_end:     pe,
    actual_start: document.getElementById('tl-as')?.value || null,
    actual_end:   document.getElementById('tl-ae')?.value || null,
  };
  const json = await api('PUT', `/projects/${p.id}`, body);
  if (!json || json.error) { alert(json?.error || 'Save failed'); return; }

  Object.assign(p, normalizeProject(json.data));
  p._tasksLoaded = true;
  editingTimeline = false;
  renderGrid();
  renderDetail();
}

/* ── PROJECT INFO EDIT ─────────────────────────────────── */
function toggleInfo() { editingInfo = !editingInfo; renderDetail(); }

async function saveInfo() {
  const p = getProj(activeProjectId);
  if (!p) return;
  const project = document.getElementById('ei-project')?.value.trim();
  const client  = document.getElementById('ei-client')?.value.trim();
  if (!project || !client) { alert('Project title and client name are required.'); return; }

  const product  = document.getElementById('ei-product')?.value || p.product;
  const status   = document.getElementById('ei-status')?.value  || p.status;
  const body = {
    client,
    project,
    sub:      document.getElementById('ei-sub')?.value.trim()      || p.sub,
    product,
    status,
    phase:    document.getElementById('ei-phase')?.value.trim()    || p.phase,
    badge:    document.getElementById('ei-badge')?.value.trim()    || p.badge,
    pm:       document.getElementById('ei-pm')?.value.trim()       || p.pm,
    revenue:  document.getElementById('ei-revenue')?.value.trim()  || p.revenue,
    deadline: document.getElementById('ei-deadline')?.value.trim() || p.deadline,
    next:     document.getElementById('ei-next')?.value.trim()     || p.next,
    remarks:  p.remarks,
    plan_start:   p.planStart,
    plan_end:     p.planEnd,
    actual_start: p.actualStart,
    actual_end:   p.actualEnd,
    mono:       p.mono,
    mono_color: p.monoColor,
  };
  const json = await api('PUT', `/projects/${p.id}`, body);
  if (!json || json.error) { alert(json?.error || 'Save failed'); return; }

  const updated = normalizeProject(json.data);
  updated.tasks        = p.tasks;
  updated._tasksLoaded = p._tasksLoaded;
  const idx = STATE.findIndex(x => x.id === p.id);
  if (idx !== -1) STATE[idx] = updated;
  editingInfo = false;
  activeProjectId = updated.id;
  renderGrid();
  renderDetail();
}

function buildProjectBody(p) {
  return {
    client:       p.client,
    project:      p.project,
    sub:          p.sub,
    product:      p.product,
    status:       p.status,
    phase:        p.phase,
    badge:        p.badge,
    pm:           p.pm,
    revenue:      p.revenue,
    deadline:     p.deadline,
    next:         p.next,
    remarks:      p.remarks,
    plan_start:   p.planStart,
    plan_end:     p.planEnd,
    actual_start: p.actualStart,
    actual_end:   p.actualEnd,
    mono:         p.mono,
    mono_color:   p.monoColor,
  };
}

/* ── TASK FORM ROW ──────────────────────────────────────── */
function taskFormRow(task, isNew) {
  const t = task || { id:'',name:'',planStart:'',planEnd:'',actualStart:'',actualEnd:'',progress:0,status:'not-started',remarks:'' };
  const statusOpts = Object.entries(TASK_STATUS).map(([k,v]) =>
    `<option value="${k}"${k===t.status?' selected':''}>${v.label}</option>`).join('');
  const onSave   = isNew ? `saveNewTask()`   : `saveEdit('${t.id}')`;
  const onCancel = isNew ? `cancelAdd()`     : `cancelEdit()`;
  const inp = (id,type,val,w,extra='') =>
    `<input type="${type}" id="${id}" class="tf-input" value="${esc(val)}" style="width:${w}" ${extra}>`;
  return `<tr style="background:rgba(77,163,255,0.04)">
    <td>${inp('tf-name','text',t.name,'150px','placeholder="Task name"')}</td>
    <td>${inp('tf-ps','date',t.planStart||'','115px')}</td>
    <td>${inp('tf-pe','date',t.planEnd||'','115px')}</td>
    <td style="color:var(--text-muted);font-size:10px">—</td>
    <td>${inp('tf-as','date',t.actualStart||'','115px')}</td>
    <td>${inp('tf-ae','date',t.actualEnd||'','115px')}</td>
    <td style="color:var(--text-muted);font-size:10px">—</td>
    <td>${inp('tf-prog','number',t.progress,'55px','min="0" max="100"')}</td>
    <td><select id="tf-status" class="tf-input" style="width:110px">${statusOpts}</select></td>
    <td>${inp('tf-remarks','text',t.remarks||'','100px','placeholder="Remarks..."')}</td>
    <td>
      <div class="t-actions">
        <button class="t-btn save" onclick="${onSave}" title="Save">✓</button>
        <button class="t-btn del"  onclick="${onCancel}" title="Cancel">×</button>
      </div>
    </td>
  </tr>`;
}

/* ── TASK CRUD ──────────────────────────────────────────── */
function openAddForm()  { showAddForm = true;  editingTaskId = null; renderDetail(); }
function cancelAdd()    { showAddForm = false; renderDetail(); }
function cancelEdit()   { editingTaskId = null; renderDetail(); }
function startEdit(id)  { editingTaskId = id; showAddForm = false; renderDetail(); }

function readTaskForm() {
  return {
    name:        document.getElementById('tf-name')?.value.trim()    || '',
    plan_start:  document.getElementById('tf-ps')?.value              || null,
    plan_end:    document.getElementById('tf-pe')?.value              || null,
    actual_start:document.getElementById('tf-as')?.value              || null,
    actual_end:  document.getElementById('tf-ae')?.value              || null,
    progress:    parseInt(document.getElementById('tf-prog')?.value   || '0', 10),
    status:      document.getElementById('tf-status')?.value          || 'not-started',
    remarks:     document.getElementById('tf-remarks')?.value         || '',
  };
}

async function saveNewTask() {
  const f = readTaskForm();
  if (!f.name || !f.plan_start || !f.plan_end) { alert('Task name, plan start and plan end are required.'); return; }
  const json = await api('POST', `/projects/${activeProjectId}/tasks`, f);
  if (!json || json.error) { alert(json?.error || 'Save failed'); return; }
  const p = getProj(activeProjectId);
  if (p) { p.tasks.push(normalizeTask(json.data)); }
  showAddForm = false;
  renderGrid();
  renderDetail();
}

async function saveEdit(taskId) {
  const f = readTaskForm();
  if (!f.name || !f.plan_start || !f.plan_end) { alert('Task name, plan start and plan end are required.'); return; }
  const json = await api('PUT', `/tasks/${taskId}`, f);
  if (!json || json.error) { alert(json?.error || 'Save failed'); return; }
  const p = getProj(activeProjectId);
  if (p) {
    const idx = p.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) p.tasks[idx] = normalizeTask(json.data);
  }
  editingTaskId = null;
  renderGrid();
  renderDetail();
}

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  const json = await api('DELETE', `/tasks/${taskId}`);
  if (!json || json.error) { alert(json?.error || 'Delete failed'); return; }
  const p = getProj(activeProjectId);
  if (p) p.tasks = p.tasks.filter(t => t.id !== taskId);
  renderGrid();
  renderDetail();
}

async function deleteProject(projectId) {
  const p = getProj(projectId);
  if (!p) return;
  const confirmed = confirm(`Delete "${p.client} — ${p.project}"?\n\nThis will permanently remove the project and all its tasks.`);
  if (!confirmed) return;
  const json = await api('DELETE', `/projects/${projectId}`);
  if (!json || json.error) { alert(json?.error || 'Delete failed'); return; }
  STATE = STATE.filter(pr => pr.id !== projectId);
  if (currentView === 'detail') showList();
  renderStats();
  renderGrid();
}

/* ── NEW PROJECT MODAL ──────────────────────────────────── */
function openProjectModal()  { document.getElementById('project-modal').classList.add('open'); }
function closeProjectModal() {
  document.getElementById('project-modal').classList.remove('open');
  ['pf-client','pf-sub','pf-project','pf-pm','pf-revenue','pf-next','pf-remarks',
   'pf-plan-start','pf-plan-end','pf-actual-start','pf-actual-end']
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
}

async function submitNewProject() {
  const client  = document.getElementById('pf-client')?.value.trim();
  const project = document.getElementById('pf-project')?.value.trim();
  const ps      = document.getElementById('pf-plan-start')?.value;
  const pe      = document.getElementById('pf-plan-end')?.value;
  if (!client || !project || !ps || !pe) { alert('Client name, project title, plan start and plan end are required.'); return; }

  const product  = document.getElementById('pf-product')?.value  || 'Olvo Claims';
  const status   = document.getElementById('pf-status')?.value   || 'active';
  const badgeMap = { hot:'Hot',active:'Active',poc:'POC',v2:'V2 Dev',done:'Completed' };
  const mono     = (client.match(/\b[A-Z]/g)||[]).slice(0,3).join('') || client.slice(0,3).toUpperCase();

  const body = {
    client, project, product, status,
    sub:          document.getElementById('pf-sub')?.value.trim()      || null,
    mono,
    mono_color:   PALETTE[STATE.length % PALETTE.length],
    badge:        badgeMap[status] || 'Active',
    pm:           document.getElementById('pf-pm')?.value.trim()       || null,
    revenue:      document.getElementById('pf-revenue')?.value.trim()  || null,
    next:         document.getElementById('pf-next')?.value.trim()     || null,
    remarks:      document.getElementById('pf-remarks')?.value.trim()  || null,
    plan_start:   ps,
    plan_end:     pe,
    actual_start: document.getElementById('pf-actual-start')?.value   || null,
    actual_end:   document.getElementById('pf-actual-end')?.value     || null,
  };

  const json = await api('POST', '/projects', body);
  if (!json || json.error) { alert(json?.error || 'Create failed'); return; }
  const newProj = normalizeProject(json.data);
  newProj._tasksLoaded = true;
  STATE.unshift(newProj);
  renderStats();
  renderGrid();
  closeProjectModal();
}

/* ── FILTERS ────────────────────────────────────────────── */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilter(btn.dataset.filter);
  });
});

/* ── KEYBOARD ───────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    if (document.getElementById('project-modal').classList.contains('open')) closeProjectModal();
    else if (currentView==='detail') showList();
  }
});

/* ── INIT ───────────────────────────────────────────────── */
(async function init() {
  if (!getToken()) { location.href = '/index.html'; return; }

  const user = getCurrentUser();
  const headerSync = document.getElementById('header-sync');
  if (headerSync && user) headerSync.textContent = `${user.name} · ${user.role}`;

  document.getElementById('live-date').textContent = new Date().toLocaleDateString('en-GB',{
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });

  document.getElementById('grid').innerHTML = `<div class="loading-wrap" style="grid-column:1/-1"><div class="loading-spinner"></div></div>`;

  try {
    await loadProjects();
  } catch (err) {
    console.error('loadProjects failed:', err);
    document.getElementById('grid').innerHTML = `<div class="loading-wrap" style="grid-column:1/-1;color:#ff6b6b;font-size:13px">Failed to load projects — ${err.message || 'check connection'}</div>`;
    return;
  }
  renderStats();
  renderGrid();
})();
