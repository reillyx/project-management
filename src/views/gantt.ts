// 甘特图渲染（阶段甘特 / 详细甘特，共用时间轴 + 今日线）
import type { Project, ProjectStage, PhaseKey } from '../data/types';
import { updateStage } from '../store';
import { PHASE_META } from '../data/types';
import { diffDays, fmtDate, monthTicks, toISO, todayISO } from '../lib';
import { esc, icon, stageStatusBadge, taskStatusBadge } from '../ui';
import { isOn } from '../plugins/registry';
import { openGanttPrint } from '../plugins/gantt-print';

const DAY_W = 26;
const ROW_H = 44;
const HDR_H = 46;

interface LabelRow<T> {
  data: T;
}

interface Axis {
  start: string;
  end: string;
  months: { label: string; fromIdx: number; days: number }[];
  totalDays: number;
}

function makeAxis(start: string, end: string): Axis {
  const s = new Date(start);
  const e = new Date(end);
  return { start, end, months: monthTicks(start, end), totalDays: diffDays(toISO(e), toISO(s)) + 1 };
}

function pxLeft(date: string, ax: Axis): number {
  return diffDays(date, ax.start) * DAY_W;
}

function pxWidth(from: string, to: string): number {
  return (diffDays(to, from) + 1) * DAY_W;
}

/** 阶段甘特行 */
interface PhaseRow {
  stage: ProjectStage;
  name: string;
  color: string;
}

/** 按天绘制时间轴，确保每个日期都有明确刻度 */
function dayCells(ax: Axis): { label: string; fromIdx: number; days: number }[] {
  const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const s = new Date(`${ax.start}T00:00:00`);
  return Array.from({ length: ax.totalDays }, (_, index) => {
    const d = new Date(s);
    d.setDate(d.getDate() + index);
    return { label: md(d), fromIdx: index, days: 1 };
  });
}

/** 数据区按周整列画细竖线（每周起一根，贯穿全部行） */
function weekGridHtml(ax: Axis): string {
  return dayCells(ax)
    .filter(w => w.fromIdx > 0)
    .map(w => `<div class="absolute top-0 bottom-0 w-px bg-[#ECF0F5]" style="left:${w.fromIdx * DAY_W}px"></div>`)
    .join('');
}

function renderHeader(ax: Axis, leftLabel: string): string {
  const monthRow = ax.months
    .map(m => `<div class="shrink-0 border-r border-hair flex items-center justify-center text-[11px] font-medium text-ink-soft" style="width:${m.days * DAY_W}px">${m.label}</div>`)
    .join('');
  const dayRow = dayCells(ax)
    .map(w => `<div class="shrink-0 border-r border-hair flex items-center justify-center text-[9px] text-ink-soft font-medium" style="width:${w.days * DAY_W}px">${w.label}</div>`)
    .join('');
  const leftCell = (label?: string) =>
    label ? `<div class="px-3 flex items-center text-[12px] font-semibold text-ink-soft shrink-0 border-r border-line">${label}</div>` : '';
  return `<div style="height:${HDR_H}px" class="flex flex-col bg-canvas/80 border-b border-line">
      <div class="flex-1 flex items-stretch border-b border-hair">
        ${leftCell(leftLabel)}
        <div class="flex relative" style="width:${ax.totalDays * DAY_W}px">${monthRow}</div>
      </div>
      <div class="flex-1 flex items-stretch">
        ${leftCell(leftLabel)}
      <div class="flex relative" style="width:${ax.totalDays * DAY_W}px">${dayRow}</div>
      </div>
    </div>`;
}

function todayLine(ax: Axis): string {
  if (ax.start <= todayISO() && todayISO() <= ax.end) {
    const l = pxLeft(todayISO(), ax);
    return `<div class="absolute top-0 bottom-0 w-[2px] bg-[#C00000]/70 z-10 pointer-events-none" style="left:${l}px" title="今天">
      <div class="absolute -top-px left-0 -translate-x-1/2 text-[9px] leading-none text-[#C00000] font-semibold">今</div></div>`;
  }
  return '';
}

export function renderPhaseGantt(root: HTMLElement, p: Project): void {
  const stages = p.stages;
  const ax = makeAxis(p.planStart, p.planEnd);

  const rows: PhaseRow[] = stages.map(st => ({
    stage: st,
    name: `${PHASE_META[st.key].code}. ${PHASE_META[st.key].name}`,
    color: PHASE_META[st.key].color,
  }));

  const leftPane = `
    <div class="shrink-0 border-r border-line bg-white" style="width:286px">
      <div style="height:${HDR_H}px" class="flex items-center justify-end px-3 border-b border-line bg-canvas/80">
        <span class="text-[12px] font-semibold text-ink-soft">阶段 / 计划</span>
      </div>
      ${rows
        .map(r => {
          const st = r.stage;
          const statusBadge = stageStatusBadge(st.status);
          return `<div style="height:${ROW_H}px" class="flex items-center gap-2 border-b border-hair px-3" data-phase="${st.key}">
            <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${r.color}"></span>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] text-ink font-medium">${r.name}</div>
              <div class="flex items-center gap-1 mt-0.5">
                <input type="date" class="w-[92px] text-[10px] text-ink-faint bg-transparent border-0 p-0 focus:outline-none focus:ring-1 focus:ring-brand rounded" value="${st.planStart}" data-stage-date="start" data-stage-key="${st.key}" aria-label="${r.name} 计划开始日期">
                <span class="text-[10px] text-ink-faint">—</span>
                <input type="date" class="w-[92px] text-[10px] text-ink-faint bg-transparent border-0 p-0 focus:outline-none focus:ring-1 focus:ring-brand rounded" value="${st.planEnd}" data-stage-date="end" data-stage-key="${st.key}" aria-label="${r.name} 计划结束日期">
              </div>
            </div>
            ${statusBadge}
          </div>`;
        })
        .join('')}
    </div>`;

  const bars = rows
    .map(r => {
      const st = r.stage;
      const l = pxLeft(st.planStart, ax);
      const w = pxWidth(st.planStart, st.planEnd);
      const isPending = st.status === 'pending';
      const fill = isPending
        ? 'rgba(229,234,241,0.5)'
        : st.status === 'active'
          ? r.color
          : r.color;
      const border = isPending ? 'dashed 1px #CBD6E0' : '1px solid rgba(0,0,0,0.06)';
      const label =
        w > 46 ? `<span class="px-1 text-[11px] font-medium truncate ${isPending ? 'text-ink-faint' : 'text-white'}">${PHASE_META[st.key].name}${st.status === 'active' ? '<span class="inline-block w-1.5 h-1.5 rounded-full bg-white align-middle"></span>' : st.status === 'done' ? ' ' + icon('check', 9) : ''}</span>` : '';
      return `<div style="height:${ROW_H}px" class="relative border-b border-hair" data-phase="${st.key}">
        ${todayLine(ax)}
        <div title="${st.planEnd}" class="absolute top-1/2 -translate-y-1/2 rounded-md h-5 flex items-center overflow-hidden cursor-pointer hover:brightness-105" style="left:${l}px;width:${Math.max(w, 14)}px;background:${fill};border:${border}" data-phase="${st.key}">
          ${label}
        </div>
      </div>`;
    })
    .join('');
  const rightPane = `<div class="relative bg-white" style="width:${ax.totalDays * DAY_W}px">${weekGridHtml(ax)}${bars}</div>`;

  root.innerHTML = `
  <div class="max-w-[1400px] mx-auto space-y-3 view-enter">
    <div class="flex items-center gap-3 flex-wrap">
      <button class="btn" data-back>${icon('chevron', 12)} 返回列表</button>
      <div class="flex-1 min-w-0">
        <div class="text-[15px] font-semibold text-ink truncate">${esc(p.name)}</div>
        <div class="text-[11px] text-ink-faint">${esc(p.code)} · ${esc(p.customer)} · 阶段甘特（点击阶段查看详细任务）</div>
      </div>
      ${isOn('gantt-print') ? `<button class="btn" data-print-gantt>${icon('print', 14)} 打印</button>` : ''}
      <a href="#/project/${p.id}" class="btn">${icon('doc', 14)} 项目详情</a>
      <a href="#/files/${p.id}" class="btn">${icon('folder', 14)} 文件管理</a>
    </div>

    <div class="card overflow-hidden">
      <div class="flex items-stretch">
        ${leftPane}
        <div class="overflow-x-auto flex-1 min-w-0">
          <div class="relative" style="min-width:${ax.totalDays * DAY_W}px">
            ${renderHeader(ax, '')}
            <div class="relative">${rightPane}</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  root.querySelector('[data-back]')?.addEventListener('click', () => {
    window.location.hash = '#/projects';
  });
  root.querySelectorAll<HTMLInputElement>('[data-stage-date]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.stageKey as PhaseKey;
      const field = input.dataset.stageDate;
      const stage = p.stages.find(item => item.key === key);
      if (!stage || (field !== 'start' && field !== 'end') || !input.value) return;
      const nextStart = field === 'start' ? input.value : stage.planStart;
      const nextEnd = field === 'end' ? input.value : stage.planEnd;
      if (nextStart > nextEnd) {
        input.value = field === 'start' ? stage.planStart : stage.planEnd;
        return;
      }
      updateStage(p.id, key, field === 'start' ? { planStart: input.value } : { planEnd: input.value });
      renderPhaseGantt(root, p);
    });
  });
  root.querySelector('[data-print-gantt]')?.addEventListener('click', () => {
    openGanttPrint(p);
  });

  // 点击阶段 -> 详细甘特
  root.querySelectorAll('[data-phase]').forEach(el => {
    el.addEventListener('click', (event: Event) => {
      if (event.target instanceof HTMLElement && event.target.closest('input')) return;
      const k = el.getAttribute('data-phase');
      if (k) window.location.hash = `#/gantt/${p.id}/${k}`;
    });
  });

  // 初始滚动到今天，之前的可拖动查看
  const scroller = root.querySelector<HTMLElement>('.overflow-x-auto');
  const today = todayISO();
  if (scroller && ax.start <= today && today <= ax.end) {
    const todayIdx = diffDays(today, ax.start);
    const target = todayIdx * DAY_W - scroller.clientWidth * 0.35;
    scroller.scrollLeft = Math.max(0, target);
  }
}

export function renderDetailGantt(root: HTMLElement, p: Project, phaseKey?: string): void {
  const ph: PhaseKey | undefined =
    phaseKey && phaseKey in PHASE_META ? (phaseKey as PhaseKey) : undefined;
  const tasks = ph ? p.tasks.filter(t => t.phase === ph) : p.tasks;
  const rangeStart = tasks.length ? tasks[0].start : p.planStart;
  const rangeEnd = tasks.length ? tasks[tasks.length - 1].end : p.planEnd;
  const ax = makeAxis(rangeStart, rangeEnd);

  const leftRows = tasks
    .map(t => {
      const m = PHASE_META[t.phase];
      return `<div style="height:${ROW_H}px" class="flex items-center gap-2 border-b border-hair px-3">
        <span class="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-semibold shrink-0" style="background:${m.color}">${m.code}</span>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] text-ink truncate">${esc(t.name)}${t.milestone ? ' <span class="text-[#B8860B]">◆</span>' : ''}</div>
          <div class="text-[10px] text-ink-faint flex items-center gap-1">${esc(t.owner)} · ${fmtDate(t.start)} — ${fmtDate(t.end)}</div>
        </div>
        ${taskStatusBadge(t.status)}
      </div>`;
    })
    .join('');

  const bars = tasks
    .map(t => {
      const l = pxLeft(t.start, ax);
      const w = pxWidth(t.start, t.end);
      const m = PHASE_META[t.phase];
      const fill =
        t.status === 'done' ? m.color : t.status === 'doing' ? m.color : 'rgba(229,234,241,0.6)';
      const label = w > 44 ? `<span class="px-1.5 text-[11px] ${t.status === 'todo' ? 'text-ink-faint' : 'text-white'} truncate">${esc(t.name)}</span>` : '';
      return `<div style="height:${ROW_H}px" class="relative border-b border-hair">
        ${todayLine(ax)}
        <div title="${t.name} · ${t.progress}%" class="absolute top-[9px] left-0 rounded-md h-[18px] flex items-center overflow-hidden"
             style="left:${l}px;width:${Math.max(w, 12)}px;background:${fill};border:${t.status === 'todo' ? 'dashed 1px #CBD6E0' : '1px solid rgba(0,0,0,0.06)'}">
          ${label}
          ${t.status === 'doing' ? `<div class="absolute inset-y-0 left-0 bg-white/30" style="width:${t.progress}%"></div>` : ''}
        </div>
      </div>`;
    })
    .join('');

  const phasesTabs = p.stages
    .map(st => {
      const k = st.key;
      const active = ph === k;
      const meta = PHASE_META[k];
      return `<button class="ph-tab px-2.5 py-1 rounded-md text-[12px] transition-colors border ${active ? 'text-white border-transparent' : 'text-ink-soft border-transparent hover:bg-brand-soft'}"
        data-phase="${k}" style="${active ? `background:${meta.color}` : ''}">${meta.name}</button>`;
    })
    .join('');

  root.innerHTML = `
  <div class="max-w-[1400px] mx-auto space-y-3 view-enter">
    <div class="flex items-center gap-3 flex-wrap">
      <button class="btn" data-back>${icon('chevron', 12)} 阶段甘特</button>
      <div class="flex-1 min-w-0">
        <div class="text-[15px] font-semibold text-ink truncate">${esc(p.name)}</div>
        <div class="text-[11px] text-ink-faint">${esc(p.code)} · ${ph ? PHASE_META[ph].name : '全部阶段'} · ${tasks.length} 项任务 · ${fmtDate(rangeStart)} — ${fmtDate(rangeEnd)}</div>
      </div>
      ${ph ? `<span class="px-2 py-1 rounded-md text-[11px] font-medium text-white" style="background:${PHASE_META[ph].color}">当前阶段：${PHASE_META[ph].name}</span>` : ''}
      <a href="#/project/${p.id}" class="btn">${icon('doc', 14)} 项目详情</a>
    </div>

    <div class="card p-2.5 flex items-center gap-1.5 flex-wrap">
      <button class="ph-tab px-2.5 py-1 rounded-md text-[12px] border transition-colors ${!ph ? 'bg-brand text-white border-transparent' : 'text-ink-soft hover:bg-brand-soft border-transparent'}"
        data-phase="">全部</button>
      ${phasesTabs}
    </div>

    <div class="card overflow-hidden">
      <div class="flex items-stretch">
        <div class="shrink-0 border-r border-line bg-white" style="width:340px">
          <div style="height:${HDR_H}px" class="flex items-center justify-end px-3 border-b border-line bg-canvas/80">
            <span class="text-[12px] font-semibold text-ink-soft">任务 / 负责人</span>
          </div>
          ${leftRows}
        </div>
        <div class="overflow-x-auto flex-1 min-w-0">
          <div class="relative" style="min-width:${ax.totalDays * DAY_W}px">
            ${renderHeader(ax, '')}
            <div class="relative bg-white" style="min-height:${tasks.length * ROW_H}px">${weekGridHtml(ax)}${bars}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-4 text-[11px] text-ink-faint pl-1">
      <span class="flex items-center gap-1"><span class="w-3.5 h-[10px] rounded-sm inline-block" style="background:${PHASE_META.dev.color}"></span>进行中</span>
      <span class="flex items-center gap-1"><span class="w-3.5 h-[10px] rounded-sm inline-block" style="background:${PHASE_META.initiate.color}"></span>已完成</span>
      <span class="flex items-center gap-1"><span class="w-3.5 h-[10px] rounded-sm border border-dashed border-[#CBD6E0] bg-[#E5EAF1]/60 inline-block"></span>待开始</span>
      <span class="flex items-center gap-1"><span class="text-[#B8860B]">◆</span>里程碑</span>
    </div>
  </div>`;

  root.querySelector('[data-back]')?.addEventListener('click', () => {
    window.location.hash = `#/gantt/${p.id}`;
  });
  root.querySelectorAll('.ph-tab').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.getAttribute('data-phase') || '';
      window.location.hash = k ? `#/gantt/${p.id}/${k}` : `#/gantt/${p.id}`;
    });
  });

  // 初始滚动到今天，之前的可拖动查看
  const scroller = root.querySelector<HTMLElement>('.overflow-x-auto');
  const today = todayISO();
  if (scroller && ax.start <= today && today <= ax.end) {
    const todayIdx = diffDays(today, ax.start);
    const target = todayIdx * DAY_W - scroller.clientWidth * 0.35;
    scroller.scrollLeft = Math.max(0, target);
  }
}

export { ROW_H as GANTT_ROW_H };
export type { LabelRow };