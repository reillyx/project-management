// 工作台 / 到期提醒
import { activeStageIndex, collectReminders, getProjects, type Route } from '../store';
import { PHASE_META } from '../data/types';
import { daysUntil, fmtDate, LEVEL_META } from '../lib';
import { esc, icon, priorityBadge } from '../ui';
import { isOn } from '../plugins/registry';
import { renderDashboardPlugins } from '../plugins/dashboard';
import { pieChart, barOverdue, monthTimeline } from '../charts';

export function renderDashboard(root: HTMLElement, route: Route): void {
  void route;
  const projects = getProjects();
  const reminders = collectReminders();
  const inProgress = projects.filter(p => p.stages.some(s => s.status === 'active')).length;
  const done = projects.filter(p => p.stages[p.stages.length - 1].status === 'done').length;
  const overdue = reminders.filter(r => r.level === 'overdue').length;
  const near = reminders.length;
  const dashOn = isOn('dashboard');

  const stat = (label: string, value: string, color = '#2B3A4A', sub = '') => `
    <div class="card p-4 flex flex-col gap-1">
      <div class="text-xs text-ink-soft">${label}</div>
      <div class="text-[26px] font-semibold leading-none" style="color:${color}">${value}</div>
      ${sub ? `<div class="text-[11px] text-ink-faint">${sub}</div>` : ''}
    </div>`;

  const reminderBlock =
    reminders.length === 0
      ? `<div class="card p-8 text-center text-ink-faint">${icon('check', 26)}<div class="mt-2 text-[13px]">暂无 3 天内的到期提醒</div></div>`
      : `<div class="card divide-y divide-hair overflow-hidden">
          ${reminders
            .map(r => {
              const lv = LEVEL_META[r.level];
              return `<a href="#/project/${r.projectId}" class="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft transition-colors">
                <span class="w-2 h-2 rounded-full shrink-0" style="background:${lv.color}"></span>
                <span class="w-20 shrink-0 font-medium" style="color:${lv.color}">${esc(lv.label)}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] text-ink truncate">${esc(r.title)}</div>
                  <div class="text-[11px] text-ink-faint truncate">${esc(r.code)} · ${esc(r.projectName)}</div>
                </div>
                <div class="text-[12px] text-ink-soft shrink-0">${fmtDate(r.date)}</div>
              </a>`;
            })
            .join('')}
        </div>`;

  const chartEmpty = `
    <div class="card p-10 col-span-full">
      <div class="flex flex-col items-center justify-center text-center text-ink-faint">
        <div class="w-16 h-16 rounded-full bg-[#F3F6FA] flex items-center justify-center text-[#B7C2D0]">${icon('pie', 30)}</div>
        <div class="mt-3 text-[14px] font-medium text-ink-soft">暂无数据，快去创建项目吧</div>
        <div class="mt-1 text-[12px] text-ink-faint">创建项目后，这里会展示项目状态、逾期与到期任务图表</div>
        <a href="#/projects" class="mt-4 btn-primary text-[13px]">${icon('plus', 14)} 新建项目</a>
      </div>
    </div>`;

  root.innerHTML = `
  <div class="max-w-6xl mx-auto space-y-4 view-enter">
    ${dashOn ? renderDashboardPlugins(projects) : ''}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      ${projects.length === 0 ? chartEmpty : `
      <div class="card p-4">
        <div class="text-[14px] font-semibold text-ink mb-3">${icon('pie', 15)} 项目状态分布</div>
        ${pieChart(projects)}
      </div>
      <div class="card p-4">
        <div class="text-[14px] font-semibold text-ink mb-3">${icon('chart', 15)} 逾期项目（逾期天数）</div>
        ${barOverdue(projects)}
      </div>
      <div class="card p-4">
        <div class="text-[14px] font-semibold text-ink mb-3">${icon('calendar', 15)} 本月到期任务</div>
        ${monthTimeline(projects)}
      </div>`}
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${stat('项目总数', String(projects.length))}
      ${stat('进行中项目', String(inProgress), '#3D74A8')}
      ${stat('已验收项目', String(done), '#4A8A3A')}
      ${stat('近3天预警', String(near), overdue > 0 ? '#C00000' : '#B8860B', overdue > 0 ? `含 ${overdue} 项逾期` : '')}
    </div>

    <div class="card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-hair">
        <div class="flex items-center gap-2 text-[14px] font-semibold text-ink">${icon('bell', 15)} 到期提醒 <span class="text-[11px] font-normal text-ink-faint">（3 天 / 1 天 / 逾期 三级预警）</span></div>
        <a href="#/reminders" class="text-[12px] text-brand-deep hover:underline">查看全部 ${icon('chevron', 13)}</a>
      </div>
      ${reminderBlock}
    </div>

    <div class="card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-hair">
        <div class="flex items-center gap-2 text-[14px] font-semibold text-ink">${icon('list', 15)} 项目列表</div>
        <a href="#/projects" class="text-[12px] text-brand-deep hover:underline">全部项目 ${icon('chevron', 13)}</a>
      </div>
      <div class="divide-y divide-hair">
        ${projects
          .map(p => {
            const ac = activeStageIndex(p);
            const cur = p.stages[ac];
            const curName = cur ? PHASE_META[cur.key].name : '已完成';
            return `<a href="#/project/${p.id}" class="flex items-center gap-4 px-4 py-3 hover:bg-brand-soft transition-colors">
              ${priorityBadge(p.priority)}
              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-medium text-ink truncate">${esc(p.name)}</div>
                <div class="text-[11px] text-ink-faint truncate">${esc(p.customer)} · ${esc(p.code)}</div>
              </div>
              <div class="w-44 shrink-0">
                <div class="text-[11px] text-ink-soft mb-1 flex justify-between"><span>${curName}</span><span>${p.progress}%</span></div>
              </div>
              <div class="text-[12px] text-ink-faint w-10 text-right shrink-0">${icon('chevron', 14)}</div>
            </a>`;
          })
          .join('')}
      </div>
    </div>
  </div>`;
}