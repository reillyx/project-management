// 到期提醒全部列表（按级别分组）
import { collectReminders } from '../store';
import { daysUntil, fmtDate, LEVEL_META } from '../lib';
import { badge, esc, icon } from '../ui';

export function renderReminders(root: HTMLElement): void {
  const reminders = collectReminders();
  const groups: { level: 'overdue' | 'urgent' | 'warning'; title: string }[] = [
    { level: 'overdue', title: '已逾期' },
    { level: 'urgent', title: '1 天内到期' },
    { level: 'warning', title: '3 天内到期' },
  ];

  const counts = {
    overdue: reminders.filter(r => r.level === 'overdue').length,
    urgent: reminders.filter(r => r.level === 'urgent').length,
    warning: reminders.filter(r => r.level === 'warning').length,
  };

  const rows = (lv: 'overdue' | 'urgent' | 'warning') =>
    reminders
      .filter(r => r.level === lv)
      .map(r => {
        const m = LEVEL_META[r.level];
        const days = daysUntil(r.date);
        return `<a href="#/project/${r.projectId}" class="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft transition-colors border-t border-hair first:border-0">
          ${badge(m.label, m.color, m.bg)}
          <div class="flex-1 min-w-0">
            <div class="text-[13px] text-ink truncate">${esc(r.title)}</div>
            <div class="text-[11px] text-ink-faint truncate">${esc(r.code)} · ${esc(r.projectName)}</div>
          </div>
          <div class="text-[12px] text-ink-soft">${fmtDate(r.date)}</div>
          <div class="text-[12px] font-medium w-16 text-right" style="color:${m.color}">${days < 0 ? `逾期${-days}天` : ``}</div>
        </a>`;
      });

  root.innerHTML = `
  <div class="max-w-4xl mx-auto space-y-4 view-enter">
    <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('bell', 16)} 到期提醒</div>
    ${groups
      .map(g => {
        const cnt = counts[g.level];
        const color = LEVEL_META[g.level].color;
        return `<div class="card overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-2.5 border-b border-hair">
            <span class="w-2 h-2 rounded-full" style="background:${color}"></span>
            <span class="text-[13px] font-semibold" style="color:${color}">${g.title}</span>
            <span class="text-[11px] text-ink-faint">${cnt} 项</span>
          </div>
          ${cnt === 0 ? `<div class="px-4 py-6 text-center text-[12px] text-ink-faint">暂无</div>` : rows(g.level).join('')}
        </div>`;
      })
      .join('')}
  </div>`;
}