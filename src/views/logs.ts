// 操作日志：按时间倒序展示关键操作，支持按项目筛选
import { getLogs, getProjects, clearLogs, type OperationLog } from '../store';
import { esc, icon, toast } from '../ui';

const ACTION_META: Record<string, { label: string; color: string }> = {
  create: { label: '创建', color: '#70AD47' },
  update: { label: '修改', color: '#5B9BD5' },
  delete: { label: '删除', color: '#C00000' },
  status: { label: '状态', color: '#E36C0A' },
};
const TARGET_META: Record<string, { label: string; icon: string }> = {
  project: { label: '项目', icon: 'folder' },
  stage: { label: '阶段', icon: 'list' },
  task: { label: '任务', icon: 'check' },
  contract: { label: '合同', icon: 'doc' },
  team: { label: '成员', icon: 'users' },
  template: { label: '模板', icon: 'doc' },
  signature: { label: '签名', icon: 'pen' },
  settings: { label: '设置', icon: 'settings' },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function renderLogs(root: HTMLElement): void {
  const logs = getLogs();
  const projects = getProjects();

  const render = (projectId: string): void => {
    const filtered = (projectId ? logs.filter(l => l.projectId === projectId) : logs);
    const rows = filtered.length
      ? filtered.map(l => {
          const am = ACTION_META[l.action] ?? { label: l.action, color: '#6B7A90' };
          const tm = TARGET_META[l.target] ?? { label: l.target, icon: 'doc' };
          const projName = l.projectId ? (projects.find(p => p.id === l.projectId)?.name ?? '') : '';
          return `<div class="flex items-start gap-3 py-2.5 px-4 border-b border-hair last:border-b-0 hover:bg-brand-soft/50 transition-colors">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-brand-light text-brand-deep">${icon(tm.icon, 15)}</span>
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span class="text-[13px] text-ink font-medium truncate">${esc(l.detail)}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded font-medium" style="background:${am.color}1A;color:${am.color}">${am.label}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-canvas/70 text-ink-faint font-mono">${tm.label}</span>
              </div>
              ${projName ? `<div class="text-[11px] text-ink-faint mt-0.5">项目：${esc(projName)}</div>` : ''}
            </div>
            <div class="shrink-0 text-right">
              <div class="text-[12px] text-ink-soft font-mono">${esc(l.user || '—')}</div>
              <div class="text-[11px] text-ink-faint">${fmtDateTime(l.time)}</div>
            </div>
          </div>`;
        }).join('')
      : `<div class="py-12 text-center text-ink-faint">${icon('doc', 20)}<div class="mt-2 text-[13px]">暂无操作日志</div></div>`;

    root.innerHTML = `
    <div class="max-w-[1000px] mx-auto space-y-3 view-enter">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('list', 17)} 操作日志</div>
        <span class="badge-proto text-[11px] text-ink-faint">${filtered.length} 条 · 关键操作自动记录</span>
        <div class="flex-1"></div>
        <select id="logProject" class="input w-64">
          <option value="">全部项目</option>
          ${projects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <button id="logClear" class="btn-ghost text-[12px]">${icon('trash', 13)} 清空日志</button>
      </div>
      <div class="card overflow-hidden">${rows}</div>
    </div>`;

    const sel = root.querySelector('#logProject') as HTMLSelectElement | null;
    sel?.addEventListener('change', () => render(sel.value));
    root.querySelector('#logClear')?.addEventListener('click', () => {
      if (!window.confirm('确认清空全部操作日志？')) return;
      clearLogs();
      toast('操作日志已清空');
      render(sel ? sel.value : '');
    });
  };

  render('');
}