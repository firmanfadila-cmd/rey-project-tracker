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
const STATUS_COLOR = { hot:'#f5730c', active:'#4da3ff', poc:'#ffd166', v2:'#b594f8', done:'#2dd4a7' };
const TASK_STATUS = {
  'not-started': { label:'Not Started', color:'#5c7086',  bg:'rgba(92,112,134,0.14)' },
  'in-progress': { label:'In Progress', color:'#145a94',  bg:'rgba(77,163,255,0.16)' },
  'completed':   { label:'Completed',   color:'#0f8f6f',  bg:'rgba(45,212,167,0.16)' },
  'delayed':     { label:'Delayed',     color:'#c23b3b',  bg:'rgba(194,59,59,0.14)'  },
  'on-hold':     { label:'On Hold',     color:'#8a6d00',  bg:'rgba(255,209,102,0.22)'},
};
const TAG_CLASS = { 'Olvo Claims':'tag-claims','Olvo UW':'tag-uw','Platform':'tag-platform' };
const CAT_MAP   = { 'Olvo Claims':'claims','Olvo UW':'uw','Platform':'platform','Analytics':'other' };
const PALETTE   = ['#1565c0','#2e7d32','#6a1b9a','#bf360c','#e65100','#00695c','#1a6eb5','#b71c1c'];
const ICON_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>`;

/* ── STATE ──────────────────────────────────────────────── */
let STATE          = [];       // array of project objects (tasks loaded on demand)
let currentView    = 'list';
let activeProjectId= null;
let editingTimeline= false;
let editingInfo    = false;
let openTaskId          = null;  // task id shown in the task card modal; 'new' = creating a top-level task; null = closed
let cardAddingSubtask   = false; // inline "add subtask" mini-form open within the current card
let revenueModalOpen    = false;
let revenueEntryEditing = null;  // the revenue row being edited, or null when adding a new month
let activeFilter        = 'all';

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
    isLive:      !!row.is_live,
    goLiveDate:  row.go_live_date || null,
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
    parentId:    row.parent_id    || null,
  };
}

// Tasks are named "1. ...", "2. ..." etc — sort on that leading number
// so the list follows the plan's natural order, not insertion order.
// Unnumbered tasks fall back to creation order, after numbered ones.
function taskOrderKey(t) {
  const m = /^(\d+)\./.exec(t.name || '');
  return m ? parseInt(m[1], 10) : Infinity;
}
function byTaskOrder(a, b) {
  return taskOrderKey(a) - taskOrderKey(b) || (a.created_at||'').localeCompare(b.created_at||'');
}
function topLevelOf(tasks)         { return tasks.filter(t => !t.parentId).sort(byTaskOrder); }
function childrenOf(tasks, parentId) { return tasks.filter(t => t.parentId === parentId).sort(byTaskOrder); }

// Next sequential number for a new task/subtask — siblings under the same
// parent (or top-level if parentId is null), based on the highest existing
// number rather than a plain count, so a mid-list deletion doesn't collide.
function nextTaskNumber(tasks, parentId) {
  const siblings = parentId ? childrenOf(tasks, parentId) : topLevelOf(tasks);
  const maxNum = siblings.reduce((max, t) => {
    const n = taskOrderKey(t);
    return (n !== Infinity && n > max) ? n : max;
  }, 0);
  return maxNum + 1;
}

// Auto-prefixes "N. " onto a task name unless the user already typed their
// own leading number.
function autoNumberName(name, tasks, parentId) {
  if (/^\d+\.\s*/.test(name)) return name;
  return `${nextTaskNumber(tasks, parentId)}. ${name}`;
}

// Warn (not block) when a subtask's dates fall outside its parent task's
// plan range — lets the user proceed deliberately rather than silently.
function validateSubtaskDates(parent, ps, pe) {
  if (!ps || !pe || !parent?.planStart || !parent?.planEnd) return true;
  const issues = [];
  if (ps < parent.planStart) issues.push(`starts before the parent task's plan start (${fmtFull(parent.planStart)})`);
  if (pe > parent.planEnd)   issues.push(`ends after the parent task's plan end (${fmtFull(parent.planEnd)})`);
  if (!issues.length) return true;
  return confirm(`This subtask ${issues.join(' and ')}. Continue anyway?`);
}

// Top-level tasks followed immediately by their subtasks, in order —
// keeps the table and Gantt chart in the same visual order.
function orderedTasks(tasks) {
  const out = [];
  topLevelOf(tasks).forEach(t => {
    out.push(t);
    childrenOf(tasks, t.id).forEach(c => out.push(c));
  });
  return out;
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

function fmtIDR(n) {
  if (n === null || n === undefined || n === '') return null;
  return 'IDR ' + Math.round(Number(n)).toLocaleString('en-US');
}

// The project-level "Potential Revenue" field is free text (e.g. "IDR 2.5B"),
// not a number input — comma-format it only when it's actually a plain number,
// otherwise leave whatever the user typed untouched.
function fmtMoneyDisplay(val) {
  if (!val) return null;
  const str = String(val).trim();
  return /^\d+(\.\d+)?$/.test(str) ? Number(str).toLocaleString('en-US') : str;
}

// Compares how far along the plan SHOULD be by today (elapsed / total plan
// days) against actual task progress — not just "days elapsed" vs "total
// plan duration", which always reads as falsely "ahead" for any project
// still short of its plan end date.
function scheduleHealth(p, prog, today) {
  if (p.actualEnd) {
    const planD = daysSpan(p.planStart, p.planEnd);
    const actD  = daysSpan(p.actualStart, p.actualEnd);
    if (!planD || !actD) return null;
    const diff = actD - planD;
    if (diff > 0) return { tone:'delayed', label:`Delivered ${diff}d late` };
    if (diff < 0) return { tone:'ontrack', label:`Delivered ${Math.abs(diff)}d early` };
    return { tone:'ontrack', label:'Delivered on time' };
  }
  if (!p.planStart || !p.planEnd) return null;
  const totalDays = daysSpan(p.planStart, p.planEnd);
  if (!totalDays) return null;

  if (today > p.planEnd) {
    const daysOver = daysFrom(p.planEnd, today);
    return { tone:'delayed', label:`Delayed · ${daysOver}d past deadline` };
  }
  const elapsedDays = Math.max(0, Math.min(totalDays, daysFrom(p.planStart, today) + 1));
  const expectedPct = Math.round((elapsedDays/totalDays) * 100);
  const gap = expectedPct - prog.pct;

  if (gap >= 20) return { tone:'delayed', label:`Delayed · ${gap}% behind plan` };
  if (gap >= 10) return { tone:'slight',  label:`Slight Delay · ${gap}% behind plan` };
  return { tone:'ontrack', label:'On Track' };
}
function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function projProgress(p) {
  // Only top-level tasks count toward the card's rollup — a phase's
  // subtasks are detail underneath it, not additional weight.
  const top = (p.tasks || []).filter(t => !t.parentId);
  if (!top.length) return { pct:0, done:0, total:0 };
  const pct  = Math.round(top.reduce((s,t) => s+(t.progress||0), 0) / top.length);
  const done = top.filter(t => t.status==='completed').length;
  return { pct, done, total:top.length };
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

async function loadRevenue(projectId) {
  const json = await api('GET', `/revenue/projects/${projectId}`);
  return (json && !json.error) ? json.data : [];
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
    { color:'#f5730c', num:STATE.filter(p=>p.status==='hot'||p.status==='v2').length, lbl:'Urgent' },
    { color:'#2dd4a7', num:STATE.filter(p=>p.status==='done').length,                 lbl:'Completed' },
    { color:'#2dd4a7', num:STATE.filter(p=>p.isLive).length,                          lbl:'Live' },
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
  grid.querySelectorAll('.prow, .loading-wrap').forEach(c => c.remove());

  STATE.forEach((p, i) => {
    const prog    = projProgress(p);
    const color   = STATUS_COLOR[p.status] || '#4da3ff';
    const tagCls  = TAG_CLASS[p.product] || '';
    const isAdmin = getCurrentUser()?.role === 'admin';

    const row = document.createElement('tr');
    row.className = 'prow';
    row.dataset.status   = p.status;
    row.dataset.category = p.category;
    row.dataset.live     = p.isLive ? 'true' : 'false';
    row.dataset.client   = (p.client || '').toLowerCase();
    row.style.animationDelay = `${0.03 + i * 0.03}s`;

    row.innerHTML = `
      <td class="col-client">
        <div class="row-identity">
          <div class="monogram" style="background:${p.monoColor}">${esc(p.mono||'?')}</div>
          <div><div class="client-name">${esc(p.client)}</div><div class="client-sub">${esc(p.sub||'')}</div></div>
        </div>
      </td>
      <td class="col-project">
        <div class="row-project">${esc(p.project)}</div>
        <div class="row-tags">
          <span class="tag ${tagCls}">${esc(p.product||'')}</span>
          <span class="tag">${esc(p.phase||'—')}</span>
        </div>
      </td>
      <td class="col-status">
        <div class="col-status-cell">
          ${p.isLive ? `<span class="live-chip"><span class="live-dot"></span>Live</span>` : ''}
          <div class="status-badge badge-${p.status}">
            <div class="status-dot" style="background:${color}"></div>${esc(p.badge)}
          </div>
        </div>
      </td>
      <td class="col-deadline ${p.urgent?'urgent':''}">${esc(p.deadline||'—')}</td>
      <td class="col-next">${esc(p.next||'—')}</td>
      <td class="col-pm">${esc(p.pm||'—')}</td>
      <td class="col-revenue">${esc(fmtMoneyDisplay(p.revenue) || '—')}</td>
      <td class="col-tasks">
        <div class="t-prog-wrap">
          <div class="t-prog-track"><div class="t-prog-fill" style="width:${prog.pct}%;background:${color}"></div></div>
          <span class="t-prog-pct">${prog.pct}%</span>
        </div>
        <div class="row-tasks-lbl">${prog.done}/${prog.total}</div>
      </td>
      <td class="col-actions">${isAdmin ? `<button class="card-del" title="Delete project">${ICON_TRASH}</button>` : ''}</td>`;

    row.addEventListener('click', () => showDetail(p.id));
    if (isAdmin) {
      row.querySelector('.card-del').addEventListener('click', e => {
        e.stopPropagation();
        deleteProject(p.id);
      });
    }
    grid.insertBefore(row, noR);
  });

  applyFilter(activeFilter);
}

let clientSearch = '';

function applyFilter(f) {
  activeFilter = f;
  const noR = document.getElementById('no-results');
  let vis = 0;
  document.querySelectorAll('.prow').forEach(row => {
    const matchesFilter = f==='all' ? true : f==='claims' ? row.dataset.category==='claims'
      : f==='uw' ? row.dataset.category==='uw' : f==='platform' ? row.dataset.category==='platform'
      : f==='done' ? row.dataset.status==='done' : f==='live' ? row.dataset.live==='true' : false;
    const matchesSearch = !clientSearch || row.dataset.client.includes(clientSearch);
    const show = matchesFilter && matchesSearch;
    row.classList.toggle('hidden', !show);
    if (show) vis++;
  });
  if (noR) noR.classList.toggle('visible', vis===0);
}

document.getElementById('client-search')?.addEventListener('input', e => {
  clientSearch = e.target.value.trim().toLowerCase();
  applyFilter(activeFilter);
});

/* ── VIEW SWITCHING ─────────────────────────────────────── */
async function showDetail(projectId) {
  activeProjectId   = projectId;
  editingTimeline   = false;
  editingInfo       = false;
  openTaskId        = null;
  cardAddingSubtask = false;
  revenueModalOpen  = false;
  revenueEntryEditing = null;
  currentView      = 'detail';
  document.getElementById('view-list').style.display   = 'none';
  document.getElementById('view-detail').style.display = 'block';

  const p = getProj(projectId);
  if (p && !p._tasksLoaded) {
    p.tasks = await loadTasksForProject(projectId);
    p._tasksLoaded = true;
  }
  if (p && !p._revenueLoaded) {
    p.revenueEntries = await loadRevenue(projectId);
    p._revenueLoaded = true;
  }
  renderDetail();
  renderTaskCardModal();
  renderRevenueModal();
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
  const variance = (p.actualEnd && planD && actD) ? actD - planD : null;
  const varBadge = variance===null ? ''
    : variance>0  ? `<span class="var-badge var-over">+${variance}d over</span>`
    : variance<0  ? `<span class="var-badge var-under">${Math.abs(variance)}d early</span>`
    :                `<span class="var-badge var-on">On track</span>`;
  const health = scheduleHealth(p, prog, today);

  let html = `
    <div class="detail-header">
      <button class="btn-back" onclick="showList()">← Back</button>
      <div class="monogram" style="background:${p.monoColor};width:44px;height:44px;border-radius:11px;font-size:12px;flex-shrink:0">${esc(p.mono||'?')}</div>
      <div class="detail-identity">
        <div class="detail-client">${esc(p.client)} · ${esc(p.product||'')}</div>
        <div class="detail-title">${esc(p.project)}</div>
        <div class="detail-meta">
          <span><span class="meta-lbl">PM</span> ${esc(p.pm||'—')}</span>
          <span><span class="meta-lbl">Revenue</span> <span style="color:var(--done);font-weight:600">${esc(fmtMoneyDisplay(p.revenue) || '—')}</span></span>
          <span><span class="meta-lbl">Phase</span> ${esc(p.phase||'—')}</span>
          <span><span class="meta-lbl">Progress</span> ${prog.pct}%</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        ${p.isLive
          ? `<button class="live-chip" style="cursor:pointer;border:1px solid rgba(45,212,167,0.3)" onclick="toggleGoLive()" title="Click to revert live status">🟢 LIVE · ${fmtFull(p.goLiveDate)}</button>`
          : `<button class="btn-ghost" style="padding:5px 12px;font-size:11px" onclick="toggleGoLive()">Mark as Go Live</button>`}
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
    <div class="det-section-hdr"><div class="det-section-title">Project Health</div></div>
    <div class="timeline-grid">
      <div class="timeline-chip">
        <div class="tc-lbl">Schedule Status</div>
        <div class="tc-dates" style="color:${health ? {ontrack:'#0f8f6f',slight:'#8a6d00',delayed:'#c23b3b'}[health.tone] : 'var(--text-2)'}">
          ${health ? (health.tone==='ontrack' ? '✅ ' : '⚠️ ') + health.label : '—'}
        </div>
        <div class="tc-days">Based on plan progress vs. task completion</div>
      </div>
      <div class="timeline-chip">
        <div class="tc-lbl">Potential Revenue</div>
        <div class="tc-dates">${esc(fmtMoneyDisplay(p.revenue) || '—')}</div>
        <div class="tc-days">Set via "Edit Project Info"</div>
      </div>
    </div>
  </div>`;

  html += p.isLive ? buildRevenueSection(p) : buildRevenueLockedSection();

  const topLevel = topLevelOf(tasks);
  const subCount = tasks.length - topLevel.length;

  html += `<div class="det-section">
    <div class="det-section-hdr"><div class="det-section-title">Tasks (${topLevel.length}${subCount ? ' + '+subCount+' subtasks' : ''})</div></div>`;

  if (tasks.length > 0) {
    html += `<div class="task-table-scroll"><table class="task-table">
      <thead><tr>
        <th>Task</th>
        <th>Plan Start</th><th>Plan End</th><th>Plan Days</th>
        <th>Actual Start</th><th>Actual End</th><th>Actual Days</th>
        <th>Progress</th><th>Status</th>
        <th></th>
      </tr></thead><tbody>`;

    topLevel.forEach(t => {
      html += taskRow(t, color, today, false);
      childrenOf(tasks, t.id).forEach(st => { html += taskRow(st, color, today, true); });
    });

    html += `</tbody></table></div>`;
  } else {
    html += `<div class="task-empty">No tasks yet. Add your first task below.</div>`;
  }

  html += `<button class="btn-add-task" onclick="openTaskCard('new')">+ Add Task</button>`;
  html += `</div>`;

  if (tasks.length > 0) {
    html += `<div class="det-section">
      <div class="det-section-hdr"><div class="det-section-title">Gantt Chart</div></div>
      ${buildGantt(orderedTasks(tasks), color)}
    </div>`;
  }

  html += `</div>`;
  return html;
}

/* ── TASK ROW (read mode) ───────────────────────────────── */
function taskRow(t, color, today, isSub) {
  const pd = daysSpan(t.planStart, t.planEnd);
  const ad = t.actualStart ? daysSpan(t.actualStart, t.actualEnd||today) : null;
  const ts = TASK_STATUS[t.status] || TASK_STATUS['not-started'];
  return `<tr class="task-row-click ${isSub ? 'subtask-row' : ''}" draggable="true"
      data-task-id="${t.id}"
      ondragstart="taskDragStart(event,'${t.id}')" ondragover="taskDragOver(event)"
      ondragleave="taskDragLeave(event)" ondragend="taskDragEnd(event)" ondrop="taskDrop(event,'${t.id}')"
      onclick="taskRowClick('${t.id}')">
    <td>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="drag-handle" title="Drag to reorder">⠿</span>
        <span class="task-name-cell" title="${esc(t.name)}">${isSub ? '<span class="subtask-arrow">↳</span>' : ''}${esc(t.name)}</span>
      </div>
    </td>
    <td>${fmtShort(t.planStart)}</td><td>${fmtShort(t.planEnd)}</td><td>${pd||'—'}</td>
    <td>${fmtShort(t.actualStart)}</td><td>${fmtShort(t.actualEnd)}</td><td>${ad||'—'}</td>
    <td>
      <div class="t-prog-wrap">
        <div class="t-prog-track"><div class="t-prog-fill" style="width:${t.progress}%;background:${color}"></div></div>
        <span class="t-prog-pct">${t.progress}%</span>
      </div>
    </td>
    <td><span class="ts-badge" style="background:${ts.bg};color:${ts.color}">${ts.label}</span></td>
    <td class="t-chevron">›</td>
  </tr>`;
}

/* ── DRAG-TO-REORDER ─────────────────────────────────────── */
let dragTaskId  = null;
let justDragged = false;

function taskRowClick(id) {
  if (justDragged) { justDragged = false; return; }
  openTaskCard(id);
}

function taskDragStart(e, id) {
  dragTaskId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}
function taskDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function taskDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function taskDragEnd(e)   { e.currentTarget.classList.remove('dragging'); }

function taskUpdateBody(t) {
  return {
    name: t.name, plan_start: t.planStart, plan_end: t.planEnd,
    actual_start: t.actualStart, actual_end: t.actualEnd,
    progress: t.progress, status: t.status, remarks: t.remarks,
    parent_id: t.parentId || null,
  };
}

async function taskDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  justDragged = true;
  const draggedId = dragTaskId;
  dragTaskId = null;
  if (!draggedId || draggedId === targetId) return;

  const p = getProj(activeProjectId);
  if (!p) return;
  const dragged = p.tasks.find(t => t.id === draggedId);
  const target  = p.tasks.find(t => t.id === targetId);
  if (!dragged || !target) return;
  // Only allow reordering within the same sibling group — top-level tasks
  // among themselves, or subtasks among their siblings under one parent.
  if ((dragged.parentId || null) !== (target.parentId || null)) return;

  const siblings = dragged.parentId ? childrenOf(p.tasks, dragged.parentId) : topLevelOf(p.tasks);
  const fromIdx = siblings.findIndex(t => t.id === draggedId);
  const toIdx   = siblings.findIndex(t => t.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  siblings.splice(toIdx, 0, siblings.splice(fromIdx, 1)[0]);

  const updates = [];
  siblings.forEach((t, i) => {
    const desc = t.name.replace(/^\d+\.\s*/, '');
    const newName = `${i + 1}. ${desc}`;
    if (newName !== t.name) { t.name = newName; updates.push(t); }
  });
  if (!updates.length) return;

  renderDetail(); // reflect the new order immediately, persist after
  for (const t of updates) {
    const json = await api('PUT', `/tasks/${t.id}`, taskUpdateBody(t));
    if (json && !json.error) {
      const idx = p.tasks.findIndex(x => x.id === t.id);
      if (idx !== -1) p.tasks[idx] = normalizeTask(json.data);
    }
  }
  renderDetail();
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
      axisTicks  += `<div style="position:absolute;left:${l}%;top:0;bottom:0;width:1px;background:rgba(13,27,42,0.07)"></div>`;
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
    const planBar   = pl!==null ? `<div style="position:absolute;left:${pl}%;width:${pw}%;height:8px;border-radius:3px;background:#e7ecf1;top:50%;transform:translateY(-50%)"></div>` : '';
    const actualBar = al!==null ? `<div style="position:absolute;left:${al}%;width:${aw}%;height:14px;border-radius:3px;overflow:hidden;top:50%;transform:translateY(-50%);background:${ts.bg}">
        <div style="width:${t.progress}%;height:100%;background:${ts.color};opacity:0.75;border-radius:3px"></div>
      </div>` : '';
    rows += `<div style="display:grid;grid-template-columns:130px 1fr;align-items:center;height:36px;margin-bottom:2px">
      <div style="font-size:11px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:10px;${t.parentId?'padding-left:14px':''}" title="${esc(t.name)}">${t.parentId?'<span class="subtask-arrow">↳</span>':''}${esc(t.name)}</div>
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
    <div class="gantt-legend-item"><span style="display:inline-block;width:16px;height:5px;border-radius:3px;background:#e7ecf1"></span> Plan</div>
    <div class="gantt-legend-item"><span style="display:inline-block;width:16px;height:10px;border-radius:3px;background:${color};opacity:0.6"></span> Actual</div>
    <div class="gantt-legend-item"><span style="display:inline-block;width:1.5px;height:12px;background:var(--hot);opacity:0.65"></span> Today</div>
  </div>`;
}

/* ── REVENUE TRACKING ───────────────────────────────────── */
function fmtMonth(m) {
  if (!m) return '—';
  return new Date(m+'T00:00:00').toLocaleDateString('en-GB', { month:'short', year:'numeric' });
}

function buildRevenueLockedSection() {
  return `<div class="det-section">
    <div class="det-section-hdr"><div class="det-section-title">Revenue Tracking</div></div>
    <div class="task-empty">Revenue tracking unlocks once this project is marked as Go Live.</div>
  </div>`;
}

function buildRevenueSection(p) {
  const entries = (p.revenueEntries || []).slice().sort((a,b) => (a.month||'').localeCompare(b.month||''));
  const totalPotential = entries.reduce((s,e) => s + (Number(e.potential_revenue)||0), 0);
  const totalActual    = entries.reduce((s,e) => s + (Number(e.actual_revenue)||0), 0);
  const achievement     = totalPotential > 0 ? Math.round((totalActual/totalPotential)*100) : null;

  let html = `<div class="det-section">
    <div class="det-section-hdr">
      <div class="det-section-title">Revenue Tracking (${entries.length} month${entries.length===1?'':'s'})</div>
    </div>`;

  if (entries.length) {
    html += `<div style="display:flex;gap:20px;margin-bottom:14px;font-size:12px;color:var(--text-2)">
      <div>Total Potential: <strong style="color:var(--text-1)">${fmtIDR(totalPotential) || '—'}</strong></div>
      <div>Total Actual: <strong style="color:var(--done)">${fmtIDR(totalActual) || '—'}</strong></div>
      ${achievement!==null ? `<div>Achievement: <strong style="color:var(--text-1)">${achievement}%</strong></div>` : ''}
    </div>
    <div class="task-table-scroll"><table class="task-table">
      <thead><tr>
        <th>Month</th><th>Potential Revenue</th><th>Actual Revenue</th><th>Achievement</th><th></th>
      </tr></thead><tbody>` +
      entries.map(e => {
        const pct = e.potential_revenue > 0 ? Math.round((Number(e.actual_revenue||0)/Number(e.potential_revenue))*100) : null;
        return `<tr class="task-row-click" onclick="openRevenueModalById('${e.id}')">
          <td><span class="task-name-cell">${fmtMonth(e.month)}</span></td>
          <td>${fmtIDR(e.potential_revenue) || '—'}</td>
          <td>${fmtIDR(e.actual_revenue) || '—'}</td>
          <td>${pct!==null ? pct+'%' : '—'}</td>
          <td class="t-chevron">›</td>
        </tr>`;
      }).join('') +
      `</tbody></table></div>`;
  } else {
    html += `<div class="task-empty">No revenue data yet. Add the first month below.</div>`;
  }

  html += `<button class="btn-add-task" onclick="openRevenueModal(null)">+ Add Month</button></div>`;
  return html;
}

function openRevenueModal(entry) {
  revenueModalOpen    = true;
  revenueEntryEditing = entry;
  renderRevenueModal();
}
function openRevenueModalById(id) {
  const p = getProj(activeProjectId);
  openRevenueModal(p?.revenueEntries?.find(r => r.id === id) || null);
}
function closeRevenueModal() {
  revenueModalOpen    = false;
  revenueEntryEditing = null;
  renderRevenueModal();
}

function renderRevenueModal() {
  const el = document.getElementById('revenue-modal');
  if (!el) return;
  if (!revenueModalOpen) { el.classList.remove('open'); el.innerHTML = ''; return; }
  el.innerHTML = buildRevenueModal(revenueEntryEditing);
  el.classList.add('open');
}

function buildRevenueModal(e) {
  const isEdit = !!e;
  return `<div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">${isEdit ? fmtMonth(e.month) : 'Add Monthly Revenue'}</div>
      <button class="btn-icon" onclick="closeRevenueModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-field form-full"><label>Month *</label><input type="month" id="rv-month" value="${isEdit ? e.month.slice(0,7) : ''}" ${isEdit ? 'disabled' : ''}></div>
        <div class="form-field"><label>Potential Revenue (IDR)</label><input type="number" id="rv-potential" min="0" value="${isEdit && e.potential_revenue!=null ? e.potential_revenue : ''}" placeholder="0"></div>
        <div class="form-field"><label>Actual Revenue (IDR)</label><input type="number" id="rv-actual" min="0" value="${isEdit && e.actual_revenue!=null ? e.actual_revenue : ''}" placeholder="0"></div>
        <div class="form-field form-full"><label>Notes</label><textarea id="rv-notes" placeholder="Any context or notes...">${esc(isEdit ? e.notes||'' : '')}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      ${isEdit ? `<button class="btn-ghost" style="color:var(--hot);margin-right:auto" onclick="deleteRevenueEntry('${e.id}')">Delete</button>` : ''}
      <button class="btn-ghost" onclick="closeRevenueModal()">Cancel</button>
      <button class="btn-primary" onclick="saveRevenueEntry()">Save</button>
    </div>
  </div>`;
}

async function saveRevenueEntry() {
  const isEdit = !!revenueEntryEditing;
  const monthInput = document.getElementById('rv-month')?.value; // 'YYYY-MM'
  if (!isEdit && !monthInput) { alert('Month is required.'); return; }
  const month = isEdit ? revenueEntryEditing.month : monthInput + '-01';

  const body = {
    month,
    potential_revenue: document.getElementById('rv-potential')?.value || null,
    actual_revenue:    document.getElementById('rv-actual')?.value || null,
    notes:             document.getElementById('rv-notes')?.value || null,
  };
  const json = await api('POST', `/revenue/projects/${activeProjectId}`, body);
  if (!json || json.error) { alert(json?.error || 'Save failed'); return; }

  const p = getProj(activeProjectId);
  if (p) {
    p.revenueEntries = p.revenueEntries || [];
    const idx = p.revenueEntries.findIndex(r => r.month === json.data.month);
    if (idx !== -1) p.revenueEntries[idx] = json.data; else p.revenueEntries.push(json.data);
  }
  revenueModalOpen = false;
  revenueEntryEditing = null;
  renderDetail();
  renderRevenueModal();
}

async function deleteRevenueEntry(id) {
  if (!confirm('Delete this month\'s revenue entry?')) return;
  const json = await api('DELETE', `/revenue/${id}`);
  if (!json || json.error) { alert(json?.error || 'Delete failed'); return; }
  const p = getProj(activeProjectId);
  if (p) p.revenueEntries = (p.revenueEntries || []).filter(r => r.id !== id);
  revenueModalOpen = false;
  revenueEntryEditing = null;
  renderDetail();
  renderRevenueModal();
}

/* ── TIMELINE EDIT ──────────────────────────────────────── */
function toggleTimeline() { editingTimeline = !editingTimeline; renderDetail(); }

async function saveTimeline() {
  const p = getProj(activeProjectId);
  if (!p) return;
  const ps = document.getElementById('tl-ps')?.value || null;
  const pe = document.getElementById('tl-pe')?.value || null;

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
    is_live:      p.isLive,
    go_live_date: p.goLiveDate,
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
    is_live:      p.isLive,
    go_live_date: p.goLiveDate,
  };
}

/* ── GO LIVE ────────────────────────────────────────────── */
async function toggleGoLive() {
  const p = getProj(activeProjectId);
  if (!p) return;
  const goingLive = !p.isLive;
  const msg = goingLive
    ? `Mark "${p.project}" as Go Live today (${fmtFull(todayISO())})?`
    : `Revert "${p.project}" from Go Live status?`;
  if (!confirm(msg)) return;

  const body = { ...buildProjectBody(p), is_live: goingLive, go_live_date: goingLive ? todayISO() : null };
  const json = await api('PUT', `/projects/${p.id}`, body);
  if (!json || json.error) { alert(json?.error || 'Save failed'); return; }

  const updated = normalizeProject(json.data);
  updated.tasks        = p.tasks;
  updated._tasksLoaded = p._tasksLoaded;
  const idx = STATE.findIndex(x => x.id === p.id);
  if (idx !== -1) STATE[idx] = updated;
  activeProjectId = updated.id;
  renderGrid();
  renderDetail();
}

/* ── TASK CARD MODAL ────────────────────────────────────── */
// Clicking any task row opens this card: full edit fields, plus (for a
// top-level task) its subtask list with an inline add-subtask form.
function renderTaskCardModal() {
  const el = document.getElementById('task-card-modal');
  if (!el) return;
  if (!openTaskId) { el.classList.remove('open'); el.innerHTML = ''; return; }

  const p      = getProj(activeProjectId);
  const isNew  = openTaskId === 'new';
  const task   = isNew ? null : p?.tasks.find(t => t.id === openTaskId);
  if (!isNew && !task) { openTaskId = null; el.classList.remove('open'); el.innerHTML = ''; return; }

  el.innerHTML = buildTaskCard(p, task, isNew);
  el.classList.add('open');
  attachMentionSupport('tc-remarks', 'tc-mention-dd');
  attachMentionSupport('scf-remarks', 'scf-mention-dd');
}

/* ── @MENTIONS IN REMARKS ───────────────────────────────── */
let mentionableUsers = null;
async function loadMentionableUsers() {
  if (mentionableUsers) return mentionableUsers;
  const json = await api('GET', '/users/mentionable');
  mentionableUsers = (json && !json.error) ? json.data : [];
  return mentionableUsers;
}

// Remarks stay a plain free-text field — this just makes "@" convenient by
// offering an autocomplete of teammate names, which get inserted as plain
// "@Name " text (no structured storage, no rendering changes elsewhere).
function attachMentionSupport(textareaId, dropdownId) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;
  ta.addEventListener('input', async () => {
    const pos = ta.selectionStart;
    const m = /@([\w. ]{0,30})$/.exec(ta.value.slice(0, pos));
    if (!m) { document.getElementById(dropdownId)?.remove(); return; }
    const query = m[1].toLowerCase();
    const users = (await loadMentionableUsers())
      .filter(u => u.name.toLowerCase().includes(query))
      .slice(0, 6);
    renderMentionDropdown(ta, dropdownId, users, m[1].length);
  });
  ta.addEventListener('blur', () => {
    setTimeout(() => document.getElementById(dropdownId)?.remove(), 150);
  });
}

function renderMentionDropdown(ta, dropdownId, matches, partialLen) {
  document.getElementById(dropdownId)?.remove();
  if (!matches.length) return;
  const dd = document.createElement('div');
  dd.id = dropdownId;
  dd.className = 'mention-dropdown';
  dd.innerHTML = matches.map(u => `<div class="mention-item" data-name="${esc(u.name)}">${esc(u.name)}</div>`).join('');
  ta.parentElement.style.position = 'relative';
  ta.parentElement.appendChild(dd);
  dd.querySelectorAll('.mention-item').forEach(item => {
    item.addEventListener('mousedown', ev => {
      ev.preventDefault();
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const newBefore = before.slice(0, before.length - partialLen - 1) + '@' + item.dataset.name + ' ';
      ta.value = newBefore + ta.value.slice(pos);
      ta.focus();
      ta.setSelectionRange(newBefore.length, newBefore.length);
      dd.remove();
    });
  });
}

function buildTaskCard(p, task, isNew) {
  const t = task || { id:'', name:'', planStart:'', planEnd:'', actualStart:'', actualEnd:'', progress:0, status:'not-started', remarks:'', parentId:null };
  const statusOpts = Object.entries(TASK_STATUS).map(([k,v]) =>
    `<option value="${k}"${k===t.status?' selected':''}>${v.label}</option>`).join('');
  const parent = t.parentId ? p?.tasks.find(x => x.id === t.parentId) : null;

  let html = `<div class="modal-box task-card-box">
    <div class="modal-header">
      <div class="modal-title">${isNew ? 'New Task' : esc(t.name)}</div>
      <button class="btn-icon" onclick="closeTaskCard()">×</button>
    </div>
    <div class="modal-body">`;

  if (parent) html += `<div class="subtask-of-note">Subtask of: ${esc(parent.name)}</div>`;

  html += `<div class="form-grid">
      <div class="form-field form-full"><label>Task Name *</label><input type="text" id="tc-name" value="${esc(t.name)}" placeholder="Task name"></div>
      <div class="form-field"><label>Plan Start</label><input type="date" id="tc-ps" value="${t.planStart||''}"></div>
      <div class="form-field"><label>Plan End</label><input type="date" id="tc-pe" value="${t.planEnd||''}"></div>
      <div class="form-field"><label>Actual Start</label><input type="date" id="tc-as" value="${t.actualStart||''}"></div>
      <div class="form-field"><label>Actual End</label><input type="date" id="tc-ae" value="${t.actualEnd||''}"></div>
      <div class="form-field"><label>Progress %</label><input type="number" id="tc-prog" min="0" max="100" value="${t.progress}"></div>
      <div class="form-field"><label>Status</label><select id="tc-status">${statusOpts}</select></div>
      <div class="form-field form-full"><label>Remarks</label><textarea id="tc-remarks" placeholder="Any context or notes...">${esc(t.remarks||'')}</textarea></div>
    </div>`;

  if (!isNew && !t.parentId) {
    const subs = childrenOf(p?.tasks||[], t.id);
    html += `<div class="form-sep"></div><div class="form-lbl-section">Subtasks (${subs.length})</div>`;
    if (subs.length) {
      html += `<div class="card-subtask-list">` + subs.map(st => {
        const ts = TASK_STATUS[st.status] || TASK_STATUS['not-started'];
        return `<div class="card-subtask-row" onclick="openTaskCard('${st.id}')">
          <span class="cs-name">${esc(st.name)}</span>
          <span class="ts-badge" style="background:${ts.bg};color:${ts.color}">${ts.label}</span>
          <span class="cs-prog">${st.progress}%</span>
        </div>`;
      }).join('') + `</div>`;
    }

    if (cardAddingSubtask) {
      html += `<div style="background:rgba(77,163,255,0.04);border:1px solid rgba(77,163,255,0.12);border-radius:12px;padding:14px;margin-top:6px">
        <div class="form-grid">
          <div class="form-field form-full"><label>Subtask Name *</label><input type="text" id="scf-name" placeholder="Subtask name"></div>
          <div class="form-field"><label>Plan Start</label><input type="date" id="scf-ps"></div>
          <div class="form-field"><label>Plan End</label><input type="date" id="scf-pe"></div>
          <div class="form-field"><label>Actual Start</label><input type="date" id="scf-as"></div>
          <div class="form-field"><label>Actual End</label><input type="date" id="scf-ae"></div>
          <div class="form-field"><label>Progress %</label><input type="number" id="scf-prog" min="0" max="100" value="0"></div>
          <div class="form-field"><label>Status</label><select id="scf-status">${statusOpts}</select></div>
          <div class="form-field form-full"><label>Remarks</label><textarea id="scf-remarks" placeholder="Any context or notes..."></textarea></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-ghost" style="padding:6px 14px;font-size:12px" onclick="cancelAddSubtaskInCard()">Cancel</button>
          <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="saveSubtaskInCard()">Save Subtask</button>
        </div>
      </div>`;
    } else {
      html += `<button class="btn-add-task" style="margin-top:2px" onclick="startAddSubtaskInCard()">+ Add Subtask</button>`;
    }
  }

  if (!isNew) {
    const files = t.attachments || [];
    html += `<div class="form-sep"></div><div class="form-lbl-section">Attachments (${files.length})</div>`;
    if (files.length) {
      html += `<div class="card-attachment-list">` + files.map(a => `
        <div class="card-attachment-row">
          <span>📄</span>
          <span class="ca-name" title="${esc(a.filename)}" onclick="downloadAttachment('${a.id}','${esc(a.filename)}')">${esc(a.filename)}</span>
          <span class="ca-size">${fmtBytes(a.size_bytes)}</span>
          <button class="btn-icon" style="width:22px;height:22px;font-size:11px" onclick="deleteAttachment('${a.id}')" title="Delete">×</button>
        </div>`).join('') + `</div>`;
    }
    html += `<input type="file" id="tc-file-input" style="display:none" onchange="handleFileSelected(event)">
      <button class="btn-add-task" style="margin-top:2px" onclick="document.getElementById('tc-file-input').click()">+ Upload Document</button>`;
  }

  html += `</div>
    <div class="modal-footer">
      ${isNew ? '' : `<button class="btn-ghost" style="color:var(--hot);margin-right:auto" onclick="deleteTaskFromCard()">Delete</button>`}
      <button class="btn-ghost" onclick="closeTaskCard()">Cancel</button>
      <button class="btn-primary" onclick="saveTaskCard()">Save</button>
    </div>
  </div>`;
  return html;
}

function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/1024/1024).toFixed(1) + ' MB';
}

async function openTaskCard(id) {
  openTaskId = id;
  cardAddingSubtask = false;
  if (id && id !== 'new') {
    const p    = getProj(activeProjectId);
    const task = p?.tasks.find(t => t.id === id);
    if (task && !task._attachmentsLoaded) {
      task.attachments = await loadAttachments(id);
      task._attachmentsLoaded = true;
    }
  }
  renderTaskCardModal();
}
function closeTaskCard()   { openTaskId = null; cardAddingSubtask = false; renderTaskCardModal(); }
function startAddSubtaskInCard()  { cardAddingSubtask = true; renderTaskCardModal(); }
function cancelAddSubtaskInCard() { cardAddingSubtask = false; renderTaskCardModal(); }

async function saveTaskCard() {
  const name = document.getElementById('tc-name')?.value.trim() || '';
  const ps   = document.getElementById('tc-ps')?.value || null;
  const pe   = document.getElementById('tc-pe')?.value || null;
  if (!name) { alert('Task name is required.'); return; }

  const body = {
    name,
    plan_start:   ps,
    plan_end:     pe,
    actual_start: document.getElementById('tc-as')?.value || null,
    actual_end:   document.getElementById('tc-ae')?.value || null,
    progress:     parseInt(document.getElementById('tc-prog')?.value || '0', 10),
    status:       document.getElementById('tc-status')?.value || 'not-started',
    remarks:      document.getElementById('tc-remarks')?.value || '',
  };

  const p     = getProj(activeProjectId);
  const isNew = openTaskId === 'new';

  if (isNew) {
    body.name = autoNumberName(body.name, p?.tasks || [], null);
    const json = await api('POST', `/projects/${activeProjectId}/tasks`, body);
    if (!json || json.error) { alert(json?.error || 'Save failed'); return; }
    if (p) p.tasks.push(normalizeTask(json.data));
  } else {
    const existing = p?.tasks.find(t => t.id === openTaskId);
    body.parent_id = existing?.parentId || null;
    if (existing?.parentId) {
      const parent = p?.tasks.find(t => t.id === existing.parentId);
      if (!validateSubtaskDates(parent, ps, pe)) return;
    }
    const json = await api('PUT', `/tasks/${openTaskId}`, body);
    if (!json || json.error) { alert(json?.error || 'Save failed'); return; }
    if (p) {
      const idx = p.tasks.findIndex(t => t.id === openTaskId);
      if (idx !== -1) p.tasks[idx] = normalizeTask(json.data);
    }
  }

  openTaskId = null;
  cardAddingSubtask = false;
  renderGrid();
  renderDetail();
  renderTaskCardModal();
}

async function saveSubtaskInCard() {
  const name = document.getElementById('scf-name')?.value.trim() || '';
  const ps   = document.getElementById('scf-ps')?.value || null;
  const pe   = document.getElementById('scf-pe')?.value || null;
  if (!name) { alert('Subtask name is required.'); return; }

  const p      = getProj(activeProjectId);
  const parent = p?.tasks.find(t => t.id === openTaskId);
  if (!validateSubtaskDates(parent, ps, pe)) return;

  const body = {
    name:         autoNumberName(name, p?.tasks || [], openTaskId),
    plan_start:   ps,
    plan_end:     pe,
    actual_start: document.getElementById('scf-as')?.value || null,
    actual_end:   document.getElementById('scf-ae')?.value || null,
    progress:     parseInt(document.getElementById('scf-prog')?.value || '0', 10),
    status:       document.getElementById('scf-status')?.value || 'not-started',
    remarks:      document.getElementById('scf-remarks')?.value || '',
    parent_id:    openTaskId,
  };

  const json = await api('POST', `/projects/${activeProjectId}/tasks`, body);
  if (!json || json.error) { alert(json?.error || 'Save failed'); return; }
  if (p) p.tasks.push(normalizeTask(json.data));

  cardAddingSubtask = false;
  renderGrid();
  renderDetail();
  renderTaskCardModal();
}

async function deleteTaskFromCard() {
  const p = getProj(activeProjectId);
  const hasChildren = p?.tasks.some(t => t.parentId === openTaskId);
  if (!confirm(hasChildren ? 'Delete this task and its subtasks?' : 'Delete this task?')) return;
  const json = await api('DELETE', `/tasks/${openTaskId}`);
  if (!json || json.error) { alert(json?.error || 'Delete failed'); return; }
  if (p) p.tasks = p.tasks.filter(t => t.id !== openTaskId && t.parentId !== openTaskId);
  openTaskId = null;
  renderGrid();
  renderDetail();
  renderTaskCardModal();
}

/* ── ATTACHMENTS ────────────────────────────────────────── */
// Uses raw fetch (not the api() helper) — uploads need multipart/form-data
// and downloads need a Blob, neither of which fit api()'s JSON-in/JSON-out shape.
async function loadAttachments(taskId) {
  const json = await api('GET', `/attachments/tasks/${taskId}`);
  return (json && !json.error) ? json.data : [];
}

async function handleFileSelected(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) { alert('File too large — max 15MB.'); return; }

  const fd = new FormData();
  fd.append('file', file);
  let json;
  try {
    const res = await fetch(`/api/attachments/tasks/${openTaskId}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: fd,
    });
    if (res.status === 401) { logout(); return; }
    json = await res.json();
  } catch (err) {
    alert('Network error — check connection');
    return;
  }
  if (!json || json.error) { alert(json?.error || 'Upload failed'); return; }

  const p = getProj(activeProjectId);
  const task = p?.tasks.find(t => t.id === openTaskId);
  if (task) { task.attachments = task.attachments || []; task.attachments.push(json.data); }
  renderTaskCardModal();
}

async function downloadAttachment(id, filename) {
  let res;
  try {
    res = await fetch(`/api/attachments/${id}/download`, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    });
  } catch (err) {
    alert('Network error — check connection');
    return;
  }
  if (res.status === 401) { logout(); return; }
  if (!res.ok) { alert('Download failed'); return; }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function deleteAttachment(id) {
  if (!confirm('Delete this attachment?')) return;
  const json = await api('DELETE', `/attachments/${id}`);
  if (!json || json.error) { alert(json?.error || 'Delete failed'); return; }
  const p = getProj(activeProjectId);
  const task = p?.tasks.find(t => t.id === openTaskId);
  if (task) task.attachments = (task.attachments || []).filter(a => a.id !== id);
  renderTaskCardModal();
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
  const ps      = document.getElementById('pf-plan-start')?.value || null;
  const pe      = document.getElementById('pf-plan-end')?.value || null;
  if (!client || !project) { alert('Client name and project title are required.'); return; }

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

/* ── MANAGE USERS ───────────────────────────────────────── */
let usersModalOpen = false;
let usersList       = null;   // cached list, loaded on open

function openUsersModal() {
  usersModalOpen = true;
  loadUsers().then(list => { usersList = list; renderUsersModal(); });
  renderUsersModal(); // show immediately in a loading state, then re-render once fetched
}
function closeUsersModal() {
  usersModalOpen = false;
  renderUsersModal();
}

async function loadUsers() {
  const json = await api('GET', '/users');
  return (json && !json.error) ? json.data : [];
}

function fmtUserDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function renderUsersModal() {
  const el = document.getElementById('users-modal');
  if (!el) return;
  if (!usersModalOpen) { el.classList.remove('open'); el.innerHTML = ''; return; }
  el.innerHTML = buildUsersModal();
  el.classList.add('open');
}

function buildUsersModal() {
  const me = getCurrentUser();
  const rows = usersList === null
    ? `<div class="task-empty">Loading…</div>`
    : usersList.map(u => `
      <div class="user-row">
        <div style="flex:1;min-width:0">
          <div class="user-row-name">${esc(u.name)}</div>
          <div class="user-row-email">${esc(u.email)} · joined ${fmtUserDate(u.created_at)}</div>
        </div>
        <span class="role-badge ${u.role==='admin' ? 'role-badge-admin' : 'role-badge-member'}">${esc(u.role)}</span>
        ${u.id !== me?.id ? `<button class="btn-icon" style="width:24px;height:24px;font-size:12px" onclick="deleteUserFromModal('${u.id}')" title="Delete">×</button>` : ''}
      </div>`).join('');

  return `<div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">Manage Users</div>
      <button class="btn-icon" onclick="closeUsersModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-lbl-section" style="margin-bottom:10px">Existing Users (${usersList === null ? '…' : usersList.length})</div>
      ${rows}
      <div class="form-sep" style="margin:18px 0"></div>
      <div class="form-lbl-section" style="margin-bottom:10px">Add User</div>
      <div class="form-grid">
        <div class="form-field"><label>Name *</label><input type="text" id="uf-name" placeholder="e.g. Khansa"></div>
        <div class="form-field"><label>Email *</label><input type="email" id="uf-email" placeholder="name@rey.id"></div>
        <div class="form-field"><label>Password *</label><input type="password" id="uf-password" placeholder="min. 8 characters"></div>
        <div class="form-field"><label>Role</label>
          <select id="uf-role">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <button class="btn-primary" style="margin-top:14px" onclick="saveNewUser()">Create User</button>
    </div>
  </div>`;
}

async function saveNewUser() {
  const name     = document.getElementById('uf-name')?.value.trim();
  const email    = document.getElementById('uf-email')?.value.trim();
  const password = document.getElementById('uf-password')?.value;
  const role     = document.getElementById('uf-role')?.value || 'member';
  if (!name || !email || !password) { alert('Name, email, and password are required.'); return; }
  if (password.length < 8) { alert('Password must be at least 8 characters.'); return; }

  const json = await api('POST', '/users', { name, email, password, role });
  if (!json || json.error) { alert(json?.error || 'Create failed'); return; }
  usersList = [...(usersList || []), json.data];
  renderUsersModal();
}

async function deleteUserFromModal(id) {
  if (!confirm('Delete this user? They will no longer be able to sign in.')) return;
  const json = await api('DELETE', `/users/${id}`);
  if (!json || json.error) { alert(json?.error || 'Delete failed'); return; }
  usersList = (usersList || []).filter(u => u.id !== id);
  renderUsersModal();
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
    if (document.getElementById('users-modal')?.classList.contains('open')) closeUsersModal();
    else if (document.getElementById('revenue-modal')?.classList.contains('open')) closeRevenueModal();
    else if (document.getElementById('task-card-modal')?.classList.contains('open')) closeTaskCard();
    else if (document.getElementById('project-modal').classList.contains('open')) closeProjectModal();
    else if (currentView==='detail') showList();
  }
});

/* ── INIT ───────────────────────────────────────────────── */
(async function init() {
  if (!getToken()) { location.href = '/index.html'; return; }

  const user = getCurrentUser();
  const headerSync = document.getElementById('header-sync');
  if (headerSync && user) headerSync.textContent = `${user.name} · ${user.role}`;
  if (user?.role === 'admin') {
    const btn = document.getElementById('btn-manage-users');
    if (btn) btn.style.display = '';
  }

  document.getElementById('live-date').textContent = new Date().toLocaleDateString('en-GB',{
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });

  document.getElementById('grid').innerHTML = `<div class="loading-wrap" style="grid-column:1/-1"><div class="loading-spinner"></div></div>`;

  try {
    await loadProjects();
  } catch (err) {
    console.error('loadProjects failed:', err);
    document.getElementById('grid').innerHTML = `<div class="loading-wrap" style="grid-column:1/-1;color:#c23b3b;font-size:13px">Failed to load projects — ${err.message || 'check connection'}</div>`;
    return;
  }
  renderStats();
  renderGrid();
})();
