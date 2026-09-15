// 数据看板插件：工作台数据概览与可视化图表
import type { Project } from '../data/types';
import { countAlerts } from '../store';

function money(s?: string): number {
  const n = Number((s ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function renderDashboardPlugins(projects: Project[]): string {
  const alerts = countAlerts();
  const inProgress = projects.filter(p => p.stages.some(s => s.status === 'active')).length;
  const done = projects.filter(p => p.stages[p.stages.length - 1]?.status === 'done').length;
  // 待验收：进入「验收」阶段但尚未完成
  const pendingAccept = projects.filter(p => !(p.stages[p.stages.length - 1]?.status === 'done') && p.stages.some(s => s.key === 'accept' && s.status !== 'done')).length;
  const pendingStart = projects.length - inProgress - done;

  const inHandMoney = projects
    .filter(p => p.stages[p.stages.length - 1]?.status !== 'done')
    .reduce((s, p) => s + money(p.contract?.amount ?? p.budget), 0);
  const doneMoney = projects
    .filter(p => p.stages[p.stages.length - 1]?.status === 'done')
    .reduce((s, p) => s + money(p.contract?.amount ?? p.budget), 0);

  const stat = (label: string, value: string, color = '#2B3A4A', sub = '') => `
    <div class="card p-4 flex flex-col gap-1">
      <div class="text-xs text-ink-soft">${label}</div>
      <div class="text-[26px] font-semibold leading-none" style="color:${color}">${value}</div>
      ${sub ? `<div class="text-[11px] text-ink-faint">${sub}</div>` : ''}
    </div>`;

  // 状态分布饼图（SVG）
  const segs: { label: string; color: string; value: number }[] = [
    { label: '进行中', color: '#5B9BD5', value: inProgress },
    { label: '已完成', color: '#70AD47', value: done },
    { label: '未开始', color: '#C5CEDA', value: pendingStart },
  ].filter(s => s.value > 0);
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  const r = 52;
  const cx = 72;
  const cy = 72;
  let ang = -90;
  let pie = '';
  segs.forEach(seg => {
    const a = (seg.value / total) * 360;
    const a1 = ((ang + 1e-9) * Math.PI) / 180;
    const a2 = ((ang + a) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const large = a > 180 ? 1 : 0;
    pie += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${seg.color}"></path>`;
    ang += a;
  });
  const legend = segs.map(s => `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:${s.color}"></span>${s.label} ${s.value}</span>`).join('');

  // 月度交付趋势（按每个项目 planEnd 月份，已完成则计 1）
  const monthAgg = new Map<string, number>();
  projects.forEach(p => {
    const doneFlag = p.stages[p.stages.length - 1]?.status === 'done';
    const m = (doneFlag ? p.endDate || p.planEnd : p.planEnd).slice(0, 7);
    monthAgg.set(m, (monthAgg.get(m) ?? 0) + (doneFlag ? 1 : 0));
  });
  const months = [...monthAgg.keys()].sort();
  const maxBar = Math.max(1, ...months.map(m => monthAgg.get(m) ?? 0));
  const trendBars = months
    .map(m => {
      const v = monthAgg.get(m) ?? 0;
      return `
        <div class="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div class="text-[10px] text-ink-soft">${v}</div>
          <div style="height:${Math.max(4, (v / maxBar) * 100)}px;min-height:4px;width:22px;border-radius:3px;background:#5B9BD5" title="${m} 月交付 ${v} 个"></div>
          <div class="text-[9px] text-ink-faint truncate">${m.slice(5)}月</div>
        </div>`;
    })
    .join('') || '<div class="text-[12px] text-ink-faint py-4">暂无已完成项目</div>';

  return `
  <div class="view-enter space-y-3">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${stat('项目总数', String(projects.length))}
      ${stat('进行中', String(inProgress), '#3D74A8')}
      ${stat('待验收', String(pendingAccept), '#B8860B')}
      ${stat('到期预警', String(alerts.total), alerts.overdue > 0 ? '#C00000' : '#B8860B', alerts.overdue > 0 ? `含 ${alerts.overdue} 项逾期` : '')}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="card p-4 flex flex-col gap-2">
        <div class="text-[14px] font-semibold text-ink">金额汇总</div>
        <div class="flex gap-3">
          <div class="flex-1 rounded-lg border border-line bg-canvas/50 p-3">
            <div class="text-[11px] text-ink-faint">在手项目总金额</div>
            <div class="text-[22px] font-semibold text-ink mt-0.5">${inHandMoney.toLocaleString()}￥</div>
          </div>
          <div class="flex-1 rounded-lg border border-line bg-canvas/50 p-3">
            <div class="text-[11px] text-ink-faint">已完成金额</div>
            <div class="text-[22px] font-semibold text-[#4A8A3A] mt-0.5">${doneMoney.toLocaleString()}￥</div>
          </div>
        </div>
        ${doneMoney + inHandMoney > 0 ? `<div class="text-[11px] text-ink-faint">完成率 ${Math.round((doneMoney / (doneMoney + inHandMoney)) * 100)}%</div>` : ''}
      </div>

      <div class="card p-4 flex flex-col gap-2">
        <div class="text-[14px] font-semibold text-ink">项目状态分布</div>
        <div class="flex items-center gap-4">
          <svg width="144" height="144" viewBox="0 0 144 144">${pie}<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="text-[12px]" fill="#2B3A4A" font-size="13" font-weight="600">${total}</text></svg>
          <div class="flex flex-col gap-1.5 text-[12px] text-ink-soft">${legend}</div>
        </div>
      </div>
    </div>

    <div class="card p-4">
      <div class="text-[14px] font-semibold text-ink mb-3">月度交付趋势（已完成项目）</div>
      <div class="flex items-end gap-2 h-28">${trendBars}</div>
    </div>
  </div>`;
}