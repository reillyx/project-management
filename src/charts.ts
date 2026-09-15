// Dashboard 可视化图表（原生 SVG 实现，无外部图表库）
import type { Project, ProjectTask } from './data/types';
import { esc, icon } from './ui';

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function daysUntil(iso: string): number {
  const now = new Date(todayISO()).getTime();
  return Math.round((new Date(iso).getTime() - now) / 86400000);
}

/** 项目状态分类：进行中 / 已上线 / 已结案 / 延期 */
export interface StatusSlice { key: string; label: string; color: string; count: number }
export function classifyProjects(projects: Project[]): { slices: StatusSlice[]; total: number } {
  const today = todayISO();
  let active = 0, online = 0, done = 0, overdue = 0;
  for (const p of projects) {
    const last = p.stages[p.stages.length - 1];
    const isOver = daysUntil(p.endDate) < 0;
    const linkDone = last?.status === 'done';
    if (p.progress >= 100 || (linkDone && isOver)) { done++; continue; }
    if (isOver || daysUntil(p.endDate) < 0) { overdue++; continue; }
    if (linkDone) { online++; continue; }
    active++;
  }
  const slices: StatusSlice[] = [
    { key: 'active', label: '进行中', color: '#5B9BD5', count: active },
    { key: 'online', label: '已上线', color: '#70AD47', count: online },
    { key: 'done', label: '已结案', color: '#9AA7B8', count: done },
    { key: 'overdue', label: '延期', color: '#C00000', count: overdue },
  ];
  return { slices, total: projects.length };
}

/** 饼图（环形） */
export function pieChart(projects: Project[]): string {
  const { slices, total } = classifyProjects(projects);
  const nonZero = slices.filter(s => s.count > 0);
  const R = 34, C = 2 * Math.PI * R;
  const size = 90;
  let acc = 0;
  let arcs = '';
  if (total > 0 && nonZero.length > 0) {
    for (const s of nonZero) {
      const frac = s.count / total;
      const dash = frac * C;
      arcs += `<circle cx="${size/2}" cy="${size/2}" r="${R}" fill="none" stroke="${s.color}" stroke-width="14"
        stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-acc * C}"
        transform="rotate(-90 ${size/2} ${size/2})"/>
        <title>${esc(s.label)} ${s.count}</title>`;
      acc += frac;
    }
  } else {
    arcs = `<circle cx="${size/2}" cy="${size/2}" r="${R}" fill="none" stroke="#EEF2F7" stroke-width="14"/>`;
  }
  const legend = slices.map(s => `
    <div class="flex items-center gap-2 text-[12px] text-ink">
      <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${s.color}"></span>
      <span class="flex-1">${s.label}</span>
      <span class="font-semibold">${s.count}</span>
    </div>`).join('');
  return `
    <div class="flex items-center gap-5">
      <div class="relative shrink-0" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}">${arcs}</svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <div class="text-[18px] font-bold leading-none text-ink">${total}</div>
          <div class="text-[10px] text-ink-soft">项目</div>
        </div>
      </div>
      <div class="space-y-1.5 flex-1">${legend}</div>
    </div>`;
}

/** 逾期项目柱状图（按逾期天数，红色标注） */
export function barOverdue(projects: Project[]): string {
  const today = todayISO();
  const list = projects
    .map(p => ({ p, days: -daysUntil(p.endDate) }))
    .filter(x => x.days > 0 && x.p.progress < 100)
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);
  if (list.length === 0) {
    return `<div class="py-8 text-center text-ink-faint">${icon('check', 22)}<div class="mt-2 text-[12px]">暂无逾期项目</div></div>`;
  }
  const max = Math.max(...list.map(x => x.days), 1);
  const bars = list.map(x => {
    const w = Math.max(6, (x.days / max) * 100);
    return `<div class="flex items-center gap-2 py-1">
      <div class="w-40 shrink-0 text-[12px] text-ink truncate" title="${esc(x.p.name)}">${esc(x.p.name)}</div>
      <div class="flex-1 h-5 bg-[#F3F6FA] rounded overflow-hidden">
        <div class="h-full flex items-center rounded text-[10px] text-white pl-1.5" style="width:${w}%;background:#C00000">${x.days}</div>
      </div>
      <div class="w-12 shrink-0 text-right text-[11px] text-[#C00000]">逾期 ${x.days} 天</div>
    </div>`;
  }).join('');
  return `<div class="px-2">${bars}</div>`;
}

/** 本月到期任务时间轴 */
export function monthTimeline(projects: Project[]): string {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = todayISO();

  interface Row { date: string; label: string; projectName: string; projectId: string; color: string }
  const rows: Row[] = [];
  for (const p of projects) {
    for (const t of p.tasks) {
      if (!t.end?.startsWith(ym)) continue;
      if (t.status === 'done') continue;
      rows.push({ date: t.end, label: t.name, projectName: p.name, projectId: p.id, color: PHASE_COLOR(t.phase) });
    }
    for (const st of p.stages) {
      if (!st.planEnd?.startsWith(ym)) continue;
      if (st.status === 'done') continue;
      rows.push({ date: st.planEnd, label: PHASE_LABEL(st.key), projectName: p.name, projectId: p.id, color: '#5B9BD5' });
    }
  }
  rows.sort((a, b) => a.date < b.date ? -1 : 1);
  const shown = rows.slice(0, 12);

  if (shown.length === 0) {
    return `<div class="py-8 text-center text-ink-faint">${icon('calendar', 22)}<div class="mt-2 text-[12px]">本月暂无到期任务</div></div>`;
  }

  // 刻度线
  const ticks = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(d => d === 1 || d === 15 || d === daysInMonth);
  const scale = ticks.map(d => {
    const cur = `${ym}-${String(d).padStart(2, '0')}`;
    return `<div class="flex items-center gap-1 shrink-0">
      <span class="text-[10px] text-ink-faint">${d}日</span>
      <span class="w-px h-4 bg-hair"></span>
    </div>`;
  }).join('');

  const items = shown.map(r => {
    const isToday = r.date === today;
    const isPast = r.date < today;
    const status = isToday ? '今日' : isPast ? '已逾期' : '';
    const dot = isToday ? '#E36C0A' : isPast ? '#C00000' : r.color;
    return `<a href="#/project/${r.projectId}" class="flex items-start gap-3 py-1.5 hover:bg-brand-soft px-1 rounded">
      <div class="w-20 shrink-0 text-[11px] ${isToday ? 'text-[#E36C0A] font-semibold' : isPast ? 'text-[#C00000]' : 'text-ink-soft'}">${fmtDD(r.date)}</div>
      <div class="flex-1 min-w-0">
        <div class="text-[13px] text-ink truncate"><span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background:${dot}"></span>${esc(r.label)}</div>
        <div class="text-[11px] text-ink-faint truncate pl-3.5">${esc(r.projectName)}</div>
      </div>
      ${status ? `<div class="text-[11px] shrink-0 ${isPast ? 'text-[#C00000]' : 'text-[#E36C0A]'}">${status}</div>` : ''}
    </a>`;
  }).join('');

  return `
    <div class="overflow-x-auto">
      <div class="flex min-w-max gap-2 px-2 pb-1 border-b border-hair">${scale}</div>
      <div class="mt-1">${items}</div>
    </div>`;
}

function fmtDD(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function PHASE_COLOR(key: string): string {
  const map: Record<string, string> = { initiate: '#5B9BD5', design: '#70AD47', develop: '#FFC000', test: '#E36C0A', finish: '#9AA7B8' };
  return map[key] ?? '#5B9BD5';
}
function PHASE_LABEL(key: string): string {
  const map: Record<string, string> = { initiate: '启动', design: '方案设计', develop: '开发对接', test: '测试', finish: '结案', online: '上线' };
  return map[key] ?? key;
}
// 消除未使用告警
void (0 as unknown as ProjectTask);