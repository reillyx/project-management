import { PHASE_META, ROLE_META, type PhaseKey, type Project, type ProjectTask } from '../data/types';
import { getProject, getProjects, getTeam, updateProject } from '../store';
import { USAGE_DIR_LIST } from '../data/mock';
import { uploadTaskFiles } from './files';
import { daysUntil, fmtDate } from '../lib';
import { esc, icon, toast } from '../ui';

/** 任务携带项目上下文 */
interface TaskRow {
  project: Project;
  task: ProjectTask;
}

/* ---------- 模块级状态（publish 全量重渲染后恢复） ---------- */
const LS = 'pm_tasks_state';
let view: 'list' | 'card' = 'list'; // ⑦ 列表/卡片
let group: 'urgency' | 'project' | 'phase' = 'urgency'; // ⑥ 分组
let scope: 'all' | 'focus' | 'done' = 'all'; // ⑧ 视角
let q = '';
let fProj = '';
let fStatus = '';
let fPhase = '';
let fPri = '';
let statFilter: '' | 'overdue' | 'today' | 'week' | 'done' = '';
let collapsed = new Set<string>();

function saveState(): void {
  try {
    localStorage.setItem(LS, JSON.stringify({ view, group, scope }));
  } catch { /* ignore */ }
}
function loadState(): void {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || '{}');
    if (s.view === 'card' || s.view === 'list') view = s.view;
    if (s.group === 'project' || s.group === 'phase' || s.group === 'urgency') group = s.group;
    if (s.scope === 'focus' || s.scope === 'done' || s.scope === 'all') scope = s.scope;
  } catch { /* ignore */ }
}
loadState();

/* ---------- 紧急度分级 ---------- */
type Urgency = 'overdue' | 'today' | 'soon' | 'normal' | 'done';

function urgencyOf(t: ProjectTask): Urgency {
  if ((t.status as string) === 'done') return 'done';
  const d = daysUntil(t.end || '');
  if (Number.isNaN(d)) return 'normal';
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 3) return 'soon';
  return 'normal';
}

const URGENCY_ORDER: Record<Urgency, number> = { overdue: 0, today: 1, soon: 2, normal: 3, done: 4 };
const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: '已逾期', today: '今日到期', soon: '3天内', normal: '正常', done: '已完成',
};
/** 左侧色条颜色 */
const URGENCY_BAR: Record<Urgency, string> = {
  overdue: '#E53E3E', today: '#E36C0A', soon: '#D69E2E', normal: '#38A169', done: '#C0C0C0',
};
/** 整行底色 */
const URGENCY_BG: Partial<Record<Urgency, string>> = {
  overdue: '#FFF0F0', today: '#FFF8F0', done: '#F2F4F6',
};

/* ---------- 数据收集 ---------- */
function allTasks(): TaskRow[] {
  const rows: TaskRow[] = [];
  getProjects().forEach(proj => {
    (proj.tasks || []).forEach(t => rows.push({ project: proj, task: t }));
  });
  return rows;
}

function ownerChips(value: string): string {
  const names = value.split(',').map(name => name.trim()).filter(Boolean);
  if (!names.length) return '<span class="text-ink-faint">未分配</span>';
  const team = getTeam();
  return names.map(name => {
    const member = team.find(item => item.name === name);
    const role = member?.roles[0];
    const color = role ? ROLE_META[role].color : '#718096';
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] text-white mr-1" style="background:${color}">${esc(name)}</span>`;
  }).join('');
}

/** 统计卡片数据 */
interface Stats { overdue: number; today: number; week: number; done: number; total: number; }
function stats(): Stats {
  const s: Stats = { overdue: 0, today: 0, week: 0, done: 0, total: 0 };
  allTasks().forEach(({ task }) => {
    s.total++;
    if (urgencyOf(task) === 'overdue') s.overdue++;
    if (urgencyOf(task) === 'today') s.today++;
    if (task.status === 'doing') s.week++;
    if ((task.status as string) === 'done') s.done++;
  });
  return s;
}

/* ---------- 筛选 ---------- */
function matches(row: TaskRow): boolean {
  const { project, task } = row;
  const status = (task.status as string) || 'todo';
  const u = urgencyOf(task);
  const days = daysUntil(task.end || '');
  if (statFilter === 'overdue' && u !== 'overdue') return false;
  if (statFilter === 'today' && u !== 'today') return false;
  if (statFilter === 'week' && status !== 'doing') return false;
  if (statFilter === 'done' && status !== 'done') return false;
  // scope
  if (scope === 'done' && status !== 'done') return false;
  if (scope === 'focus' && !(u === 'overdue' || u === 'today' || u === 'soon')) return false;
  if (scope === 'all') { /* 全通过 */ }
  // q 任务名
  if (q && !(task.name || '').toLowerCase().includes(q.toLowerCase())) return false;
  if (fProj && project.id !== fProj) return false;
  if (fStatus && (task.status as string) !== fStatus) return false;
  if (fPhase && (task.phase as string) !== fPhase) return false;
  if (fPri && (task.priority || '') !== fPri) return false;
  return true;
}

function phaseName(phase: string): string {
  return PHASE_META[phase as keyof typeof PHASE_META]?.name || phase || '—';
}

/* ---------- 渲染 ---------- */
export function renderTasks(): string {
  const s = stats();
  const doneRate = s.total ? Math.round((s.done / s.total) * 100) : 0;

  const scopeTab = (k: 'all' | 'focus' | 'done', label: string, badge: string) =>
    `<button data-scope="${k}" class="px-3 py-1.5 text-sm font-medium border-b-2 transition ${scope === k ? 'text-[#5B9BD5] border-[#5B9BD5]' : 'text-slate-500 border-transparent hover:text-slate-700'}">${label}${badge ? `<span class="ml-1 text-[10px] px-1 rounded-full bg-[#5B9BD5] text-white">${badge}</span>` : ''}</button>`;

  const projectOpts = `<option value="">全部项目</option>` + getProjects().map(p => `<option value="${esc(p.id)}" ${fProj === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const statusOpts = Object.entries(ST_LABEL).map(([k, v]) => `<option value="${k}" ${fStatus === k ? 'selected' : ''}>${v}</option>`).join('');
  const phaseOpts = `<option value="">全部阶段</option>` + Object.values(PHASE_META).map(ph => `<option value="${esc(ph.key)}" ${fPhase === ph.key ? 'selected' : ''}>${esc(ph.name)}</option>`).join('');
  const priOpts = Object.entries(PRI_LABEL).map(([k, v]) => `<option value="${k}" ${fPri === k ? 'selected' : ''}>${v}</option>`).join('');
  const activeRow = (key: 'overdue' | 'today' | 'week' | 'done') => {
    // 卡片点击筛选：按对应统计条件展示任务
    let cb = '';
    if (key === 'overdue') cb = `data-stat="overdue"`;
    if (key === 'today') cb = `data-stat="today"`;
    if (key === 'week') cb = `data-stat="week"`;
    if (key === 'done') cb = `data-stat="done"`;
    return cb;
  };
  const statCards = [
    { k: 'overdue', num: s.overdue, unit: '个', label: '已逾期', color: '#E53E3E', border: '#E53E3E' },
    { k: 'today', num: s.today, unit: '个', label: '今日到期', color: '#E36C0A', border: '#E36C0A' },
    { k: 'week', num: s.week, unit: '个', label: '最近待办', color: '#5B9BD5', border: '#5B9BD5' },
    { k: 'done', num: `${doneRate}%`, unit: '', label: '已完成率', color: '#38A169', border: '#38A169' },
  ].map(c =>
    `<button class="bg-white rounded-lg shadow-sm p-4 text-left hover:shadow transition w-1/4 shrink-0 ${statFilter === c.k ? 'ring-2 ring-offset-1 ring-[#5B9BD5]' : ''}" style="border-top:3px solid ${c.border}" ${activeRow(c.k as any)}>
      <div class="text-[28px] font-bold" style="color:${c.color}">${c.num}${c.unit}</div>
      <div class="text-xs mt-1 text-slate-500">${c.label}</div>
    </button>`
  ).join('');

  const focusBadge = getProjects().reduce((a, p) => a + (p.tasks || []).filter((t) => t.status !== 'done' && ['overdue', 'today', 'soon'].indexOf(urgencyOf(t)) >= 0).length, 0);

  const seg = (k: typeof group, label: string) =>
    `<button data-group="${k}" class="px-3 py-1.5 text-sm rounded-lg transition ${group === k ? 'bg-[#5B9BD5] text-white' : 'bg-white text-slate-600 border hover:bg-slate-50'}">${label}</button>`;

  return `
  <div data-view="tasks" class="max-w-[1400px] mx-auto space-y-4">
    <!-- 顶部：视角tab + 分组 + 视图切换 -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-1 border-b border-slate-200">
        ${scopeTab('all', '全部', '')}${scopeTab('focus', '需关注', String(focusBadge))}${scopeTab('done', '已完成', '')}
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">${seg('urgency', '紧急度')}${seg('project', '项目')}${seg('phase', '阶段')}</div>
        <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button data-viewt="list" class="px-2.5 py-1.5 rounded-md transition ${view === 'list' ? 'bg-white shadow text-[#5B9BD5]' : 'text-slate-500'}" title="列表视图">${icon('list', 16)}</button>
          <button data-viewt="card" class="px-2.5 py-1.5 rounded-md transition ${view === 'card' ? 'bg-white shadow text-[#5B9BD5]' : 'text-slate-500'}" title="卡片视图">${icon('grid', 16)}</button>
        </div>
      </div>
    </div>

    <!-- 数据概览卡片 -->
    <div class="flex gap-3">${statCards}</div>

    <!-- 筛选栏 -->
    <div class="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-2">
      <div class="relative flex-1 min-w-[200px] max-w-[260px]">
        ${icon('search', 15, 'absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400')}
        <input id="tk-s" value="${esc(q)}" placeholder="搜索任务名称..." class="pl-8 pr-3 py-1.5 w-full text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5B9BD5]/30"/>
      </div>
      <select id="tk-proj" class="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none bg-white">${projectOpts}</select>
      <select id="tk-status" class="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none bg-white"><option value="">全部状态</option>${statusOpts}</select>
      <select id="tk-phase" class="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none bg-white">${phaseOpts}</select>
      <select id="tk-pri" class="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none bg-white"><option value="">全部优先级</option>${priOpts}</select>
      <span class="ml-auto text-xs text-slate-500">共 <b class="text-slate-700" id="tk-count">0</b> 个任务</span>
    </div>

    <!-- 内容区 -->
    <div id="tk-group-title" class="bg-white rounded-lg shadow-sm border border-slate-100 px-2 py-2.5 flex items-center gap-2 text-xs font-medium text-slate-500">
      <div class="w-[32px] shrink-0">编号</div>
      <div class="flex-1 min-w-0">任务</div>
      <div class="w-[100px] shrink-0">负责人</div>
      <div class="w-[64px] shrink-0">阶段</div>
      <div class="w-[84px] shrink-0">截止日期</div>
      <div class="w-[64px] shrink-0">项目状态</div>
      <div class="w-[48px] shrink-0 text-right">倒计时</div>
      <div class="w-[72px] shrink-0 text-right">操作</div>
    </div>
    <div id="tk-body"></div>
  </div>`;
}

function matchesCount(t: TaskRow): boolean {
  const u = urgencyOf(t.task);
  return u === 'overdue' || u === 'today' || u === 'soon';
}

export const ST_LABEL: Record<string, string> = { todo: '待开始', doing: '进行中', done: '已完成' };
export const PRI_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低' };

/* ---------- 分组渲染 ---------- */
function renderBody(): string {
  let rows = allTasks().filter(matches);
  const countEl = document.getElementById('tk-count');
  if (countEl) countEl.textContent = String(rows.length);

  const sorted = [...rows].sort((a, b) => {
    const ua = urgencyOf(a.task), ub = urgencyOf(b.task);
    if (URGENCY_ORDER[ua] !== URGENCY_ORDER[ub]) return URGENCY_ORDER[ua] - URGENCY_ORDER[ub];
    return (a.task.end || '').localeCompare(b.task.end || '');
  });

  if (!sorted.length) {
    return `<div class="py-16 text-center text-slate-400"><div class="text-3xl mb-2">🔍</div>暂无匹配任务</div>`;
  }

  // 分组
  const groups: { key: string; title: string; rows: TaskRow[] }[] = [];
  if (group === 'urgency') {
    (['overdue', 'today', 'soon', 'normal', 'done'] as Urgency[]).forEach(u => {
      const g = sorted.filter(r => urgencyOf(r.task) === u);
      if (g.length) groups.push({ key: u, title: URGENCY_LABEL[u], rows: g });
    });
  } else if (group === 'project') {
    const byProj = new Map<string, TaskRow[]>();
    sorted.forEach(r => { const arr = byProj.get(r.project.id) || []; arr.push(r); byProj.set(r.project.id, arr); });
    byProj.forEach((g, key) => groups.push({ key, title: (g[0].project.name), rows: g }));
  } else {
    Object.values(PHASE_META).forEach(p => {
      const g = sorted.filter(r => (r.task.phase as string) === p.key);
      if (g.length) groups.push({ key: p.code, title: p.name, rows: g });
    });
  }

  let rowNumber = 0;

  return groups.map(g => {
    const isCollapsed = collapsed.has(g.key);
    return `<section class="mb-2">
      <button data-toggle="${esc(g.key)}" class="w-full flex items-center gap-2 py-1.5 px-1 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 rounded transition">
        <span class="inline-block w-2 h-2 rounded-sm" style="background:${URGENCY_BAR[g.key as Urgency] || '#5B9BD5'}"></span>
        ${esc(g.title)}
        <span class="text-xs font-normal text-slate-400">(${g.rows.length})</span>
        <span class="ml-auto text-slate-400">${icon(isCollapsed ? 'chevron-right' : 'chevron-down', 16)}</span>
      </button>
      ${isCollapsed ? '' : `<div class="mt-1">${g.rows.map(r => view === 'list' ? listRow(r, ++rowNumber) : cardRow(r)).join('')}</div>`}
    </section>`;
  }).join('');
}

/* ---------- 列表行 ---------- */
function listRow({ project, task }: TaskRow, rowNumber: number): string {
  const u = urgencyOf(task);
  const bg = URGENCY_BG[u] || '';
  const doneCls = u === 'done' ? 'line-through text-[#A0AEC0]' : '';
  const ld = countdown(task);
  return `
  <div class="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50 transition mb-1" style="background:${bg || 'transparent'};border-left:4px solid ${URGENCY_BAR[u]}">
    <div class="w-[32px] shrink-0 text-xs text-slate-400">${rowNumber}</div>
    <div class="w-[100px] flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        ${task.milestone ? '<span title="关键任务" style="color:#D69E2E">★</span>' : ''}
        <a href="#/project/${esc(project.id)}" class="truncate text-sm ${doneCls} hover:text-[#4a8bc2]">${esc(task.name)}</a>
      </div>
      <div class="text-xs text-slate-400 truncate">${esc(project.name)}</div>
    </div>
    <div class="w-[100px] truncate">${ownerChips(task.owner || '')}</div>
    <div class="w-[64px] text-sm text-slate-600 truncate">${esc(phaseName(task.phase as string))}</div>
    <button data-date="${esc(task.id)}" title="点击修改截止日期" class="w-[84px] text-sm text-slate-600 hover:text-[#5B9BD5] truncate">${task.end ? esc(fmtDate(task.end)) : '—'}</button>
    <button data-st="${esc(task.id)}" class="w-[64px] shrink-0">${statusBadge(task)}</button>
    <div class="w-[48px] text-right shrink-0">${ld}</div>
    <div class="w-[72px] flex justify-end gap-1 shrink-0">
      ${(task.status as string) === 'done' ? `<button data-upload-task="${esc(task.id)}" class="p-1 rounded hover:bg-brand-soft text-brand-deep transition" title="上传任务成果">${icon('upload', 15)}</button>` : `<button data-done="${esc(task.id)}" class="p-1 rounded hover:bg-emerald-100 text-slate-500 hover:text-emerald-600 transition" title="快速完成">${icon('check', 15)}</button>`}
    </div>
  </div>`;
}

/* ---------- 卡片 ---------- */
function cardRow({ project, task }: TaskRow): string {
  const u = urgencyOf(task);
  const doneCls = u === 'done' ? 'line-through text-[#A0AEC0]' : '';
  const ld = countdown(task);
  return `
  <div class="flex-1 min-w-[260px] max-w-[320px] bg-white rounded-lg shadow-sm hover:shadow transition p-3 mb-2 relative" style="border-left:4px solid ${URGENCY_BAR[u]}">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        ${task.milestone ? '<span title="关键任务" style="color:#D69E2E">★</span>' : ''}
        <a href="#/project/${esc(project.id)}" class="text-sm font-medium ${doneCls} hover:text-[#4a8bc2]">${esc(task.name)}</a>
      </div>
      ${(task.status as string) === 'done' ? '' : `<button data-done="${esc(task.id)}" class="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition" title="快速完成">${icon('check', 14)}</button>`}
    </div>
    <div class="mt-0.5 text-xs text-slate-400">${esc(project.name)}</div>
    <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
      <span class="truncate flex items-center">👤 ${ownerChips(task.owner || '')}</span>
      <button data-date="${esc(task.id)}" title="点击修改截止日期" class="hover:text-[#5B9BD5]">${task.end ? esc(fmtDate(task.end)) : '—'}</button>
    </div>
    <div class="mt-2.5">
      <div class="text-xs text-slate-400 mb-1 flex items-center justify-between"><span>${esc(phaseName(task.phase as string))}</span><span>${ld}</span></div>
    </div>
    <div class="mt-2.5 flex items-center justify-between">
      <button data-st="${esc(task.id)}">${statusBadge(task)}</button>
     ${(task.status as string) === 'done' ? `<button data-upload-task="${esc(task.id)}" class="text-xs text-brand-deep hover:underline">${icon('upload', 12)} 上传成果</button>` : ''}
    </div>
  </div>`;
}

function statusBadge(task: ProjectTask): string {
  const status = (task.status as string) || 'todo';
  const meta: Record<string, { label: string; cls: string }> = {
    todo: { label: '待开始', cls: 'bg-slate-100 text-slate-600' },
    doing: { label: '进行中', cls: 'bg-[#EAF3FB] text-[#4A8BC2]' },
    done: { label: '已完成', cls: 'bg-emerald-50 text-emerald-600' },
  };
  const m = meta[status] || meta.todo;
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${m.cls}">${esc(m.label)} ${icon('chevron-down', 12)}</span>`;
}

function countdown(task: ProjectTask): string {
  const u = urgencyOf(task);
  if (u === 'done') return '';
  const d = daysUntil(task.end || '');
  if (Number.isNaN(d)) return '';
  if (d < 0) return `<span class="text-xs font-bold text-[#E53E3E]">逾期${-d}天</span>`;
  if (d === 0) return `<span class="text-xs font-bold text-[#E36C0A]">今天到期</span>`;
  if (d <= 3) return `<span class="text-xs font-semibold text-[#D69E2E]">还剩${d}天</span>`;
  return `<span class="text-xs text-slate-400">还剩${d}天</span>`;
}

/* 行内快捷 fn：状态切换下拉 */
let stOpen: { id: string; btn: HTMLElement } | null = null;

export function wireTasks(): void {
  const root = document.querySelector<HTMLElement>('#viewRoot > [data-view="tasks"]');
  if (!root) return;

  const rerender = () => {
    const b = document.getElementById('tk-body');
    if (b) b.outerHTML = `<div id="tk-body">${renderBody()}</div>`;
    root.querySelectorAll<HTMLElement>('[data-scope]').forEach(button => {
      const active = button.dataset.scope === scope;
      button.className = `px-3 py-1.5 text-sm font-medium border-b-2 transition ${active ? 'text-[#5B9BD5] border-[#5B9BD5]' : 'text-slate-500 border-transparent hover:text-slate-700'}`;
    });
    root.querySelectorAll<HTMLElement>('[data-group]').forEach(button => {
      const active = button.dataset.group === group;
      button.className = `px-3 py-1.5 text-sm rounded-lg transition ${active ? 'bg-[#5B9BD5] text-white' : 'bg-white text-slate-600 border hover:bg-slate-50'}`;
    });
    root.querySelectorAll<HTMLElement>('[data-viewt]').forEach(button => {
      const active = (button.dataset.viewt === 'card') === (view === 'card');
      button.className = `px-2.5 py-1.5 rounded-md transition ${active ? 'bg-white shadow text-[#5B9BD5]' : 'text-slate-500'}`;
    });
    root.querySelectorAll<HTMLElement>('[data-stat]').forEach(button => {
      button.classList.toggle('ring-2', button.dataset.stat === statFilter);
      button.classList.toggle('ring-offset-1', button.dataset.stat === statFilter);
      button.classList.toggle('ring-[#5B9BD5]', button.dataset.stat === statFilter);
    });
  };

  // 搜索
  const s = root.querySelector<HTMLInputElement>('#tk-s');
  s?.addEventListener('input', () => { q = s.value.trim(); statFilter = ''; rerender(); });
  // 筛选
  const proj = root.querySelector<HTMLSelectElement>('#tk-proj');
  proj?.addEventListener('change', () => { fProj = proj.value; statFilter = ''; rerender(); });
  const status = root.querySelector<HTMLSelectElement>('#tk-status');
  status?.addEventListener('change', () => { fStatus = status.value; statFilter = ''; rerender(); });
  const phase = root.querySelector<HTMLSelectElement>('#tk-phase');
  phase?.addEventListener('change', () => { fPhase = phase.value; statFilter = ''; rerender(); });
  const pri = root.querySelector<HTMLSelectElement>('#tk-pri');
  pri?.addEventListener('change', () => { fPri = pri.value; statFilter = ''; rerender(); });

  // 视角 / 分组 / 视图 (委托)
  root.querySelectorAll<HTMLElement>('[data-scope]').forEach(b => b.addEventListener('click', () => { scope = b.dataset.scope as typeof scope; statFilter = ''; saveState(); rerender(); }));
  root.querySelectorAll<HTMLElement>('[data-group]').forEach(b => b.addEventListener('click', () => { group = b.dataset.group as typeof group; saveState(); rerender(); }));
  root.querySelectorAll<HTMLElement>('[data-viewt]').forEach(b => b.addEventListener('click', () => { view = b.dataset.viewt === 'card' ? 'card' : 'list'; saveState(); rerender(); }));

  // 统计卡点击
  root.querySelectorAll<HTMLElement>('[data-stat]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.stat as string;
    if (k === 'done' || k === 'overdue' || k === 'today' || k === 'week') {
      scope = 'all';
      statFilter = statFilter === k ? '' : k;
      q = '';
      fProj = '';
      fStatus = '';
      fPhase = '';
      fPri = '';
      const searchInput = root.querySelector<HTMLInputElement>('#tk-s');
      if (searchInput) searchInput.value = '';
      root.querySelectorAll<HTMLSelectElement>('select').forEach(select => { select.value = ''; });
      saveState();
      rerender();
    }
  }));

  // 分组折叠
  root.querySelectorAll<HTMLElement>('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.toggle as string;
    if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k);
    rerender();
  }));

  // 状态切换 / 快速完成 / 日期修改（委托到根节点，内容重绘后仍然有效）
  root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const stBtn = t.closest<HTMLElement>('[data-st]');
      if (stBtn) { openStateMenu(stBtn, stBtn.dataset.st as string); return; }
      const doneBtn = t.closest<HTMLElement>('[data-done]');
      if (doneBtn) { quickDone(doneBtn.dataset.done as string); return; }
      const dateBtn = t.closest<HTMLElement>('[data-date]');
      if (dateBtn) { openDateEditor(dateBtn, dateBtn.dataset.date as string); return; }
      const uploadBtn = t.closest<HTMLElement>('[data-upload-task]');
      if (uploadBtn) { openTaskUpload(uploadBtn.dataset.uploadTask as string); return; }
  });
  const body = root.querySelector<HTMLElement>('#tk-body');
  if (body) body.innerHTML = renderBody();
}

function openTaskUpload(taskId: string): void {
  const row = findRow(taskId);
  if (!row || row.task.status !== 'done') return;
  const dirs = USAGE_DIR_LIST.find(item => item.stage === row.task.phase as PhaseKey)?.folders ?? [];
  if (!dirs.length) { toast('该阶段暂无可用文件目录', 'warn'); return; }
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `<div class="modal" style="max-width:420px">
    <div class="px-4 py-3 border-b border-line flex items-center justify-between">
      <span class="text-[15px] font-semibold text-ink">${icon('upload', 16)} 上传任务成果</span>
      <button class="text-ink-faint hover:text-ink" data-task-upload-close>${icon('x', 18)}</button>
    </div>
    <div class="p-4 space-y-3">
      <div class="text-[12px] text-ink-soft">任务：<span class="font-medium text-ink">${esc(row.task.name)}</span></div>
      <label class="block"><span class="text-[12px] text-ink-soft">保存到「${esc(PHASE_META[row.task.phase].name)}」阶段的目录</span>
        <select id="task-upload-folder" class="input w-full mt-1">${dirs.map(folder => `<option value="${esc(folder)}">${esc(folder)}</option>`).join('')}</select>
      </label>
      <input id="task-upload-files" type="file" class="input w-full" multiple accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png" />
    </div>
    <div class="flex justify-end gap-2 px-4 py-3 border-t border-line">
      <button class="btn" data-task-upload-cancel>取消</button>
      <button class="btn-primary" data-task-upload-save>上传</button>
    </div>
  </div>`;
  const close = (): void => bg.remove();
  bg.addEventListener('click', event => { if (event.target === bg) close(); });
  bg.querySelector('[data-task-upload-close]')?.addEventListener('click', close);
  bg.querySelector('[data-task-upload-cancel]')?.addEventListener('click', close);
  bg.querySelector('[data-task-upload-save]')?.addEventListener('click', async () => {
    const input = bg.querySelector<HTMLInputElement>('#task-upload-files');
    const folder = bg.querySelector<HTMLSelectElement>('#task-upload-folder')?.value ?? '';
    const files = Array.from(input?.files ?? []);
    if (!files.length) { toast('请选择要上传的成果文件', 'warn'); return; }
    const count = await uploadTaskFiles(row.project, row.task.phase as PhaseKey, folder, files);
    toast(`已上传 ${count} 个成果文件到「${folder}」`, 'success');
    close();
  });
  document.body.appendChild(bg);
}

/* 已开状态菜单关闭 */
function openStateMenu(btn: HTMLElement, taskId: string): void {
  const row = findRow(taskId);
  if (!row) return;
  const saving = (key: string) => setStatus(row, key);
  // 用 UI 现成 confirmFloat 不合适；这里做简易下拉
  if (stOpen && stOpen.btn === btn) { removeMenu(); return; }
  removeMenu();
  const menu = document.createElement('div');
  menu.dataset.stmenu = 'true';
  menu.style.cssText = 'position:absolute;z-index:40;background:#fff;border:1px solid #E1E8F0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.08);min-width:120px;overflow:hidden';
  ['todo', 'doing', 'done'].forEach(st => {
    const it = document.createElement('button');
    it.textContent = ST_LABEL[st];
    it.className = 'block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ' + (row.task.status === st ? 'text-[#5B9BD5] font-medium' : 'text-slate-600');
    it.addEventListener('click', () => { removeMenu(); setStatus(row, st); });
    menu.appendChild(it);
  });
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.left = `${Math.min(r.right - menu.offsetWidth + 120, window.innerWidth - 130)}px`;
  menu.style.top = `${r.bottom + 4}px`;
  stOpen = { id: taskId, btn };
  setTimeout(() => window.addEventListener('click', removeMenu, { once: true }), 0);
}
function removeMenu(): void {
  document.querySelectorAll('div[data-stmenu]').forEach(d => d.remove());
  stOpen = null;
}

function findRow(taskId: string): TaskRow | null {
  for (const r of allTasks()) if (r.task.id === taskId) return r;
  return null;
}

function setStatus(row: TaskRow, status: string): void {
  const prev = row.task.status;
  if (prev === status) return;
  const tasks = (row.project.tasks || []).map(t => t.id === row.task.id ? { ...t, status: status as ProjectTask['status'] } : t);
  updateProject(row.project.id, { tasks });
  toast(`${ST_LABEL[prev]} → ${ST_LABEL[status]}`);
  setTimeout(() => rerenderCurrent(), 0);
}
function quickDone(taskId: string): void {
  const row = findRow(taskId);
  if (!row) return;
  setStatus(row, 'done');
}
function setDate(row: TaskRow, end: string): void {
  const tasks = (row.project.tasks || []).map(t => t.id === row.task.id ? { ...t, end } : t);
  updateProject(row.project.id, { tasks });
  setTimeout(() => rerenderCurrent(), 0);
}

function openDateEditor(btn: HTMLElement, taskId: string): void {
  const row = findRow(taskId);
  if (!row) return;
  const input = document.createElement('input');
  input.type = 'date';
  input.value = row.task.end || '';
  input.className = 'text-sm border border-[#5B9BD5] rounded px-1.5 py-0.5 w-[96px]';
  btn.replaceWith(input);
  input.focus();
  const commit = () => {
    if (input.value && input.value !== row.task.end) { setDate(row, input.value); }
    else { rerenderCurrent(); }
  };
  input.addEventListener('change', commit);
  input.addEventListener('blur', () => { if (document.body.contains(input)) commit(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') rerenderCurrent(); });
}

function rerenderCurrent(): void {
  const b = document.getElementById('tk-body');
  if (b) {
    b.outerHTML = `<div id="tk-body">${renderBody()}</div>`;
  }
}