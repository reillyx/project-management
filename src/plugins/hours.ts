// 工时统计插件：项目详情内记录/汇总工时，支持导出 Excel
import { addHour, getProject, getProjectHours, getTeam, removeHour } from '../store';
import { PHASE_META, type PhaseKey } from '../data/types';
import { exportXlsx, fmtISO, todayISO } from '../lib';
import { esc, icon } from '../ui';

export function mountHours(host: HTMLElement, projectId: string): void {
  const p = getProject(projectId);
  if (!p) return;
  const rows = getProjectHours(projectId);
  const members = getTeam();

  const phaseOpts = p.stages
    .map(s => {
      const m = PHASE_META[s.key];
      return `<option value="${s.key}">${m.name}</option>`;
    })
    .join('');

  const workerOpts = members
    .map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`)
    .join('');
  const workerList = members.map(m => m.name);

  // 汇总
  const totalH = rows.reduce((s, r) => s + r.hours, 0);
  const byPerson = new Map<string, number>();
  const byPhase = new Map<string, number>();
  rows.forEach(r => {
    byPerson.set(r.worker, (byPerson.get(r.worker) ?? 0) + r.hours);
    byPhase.set(r.phaseKey ?? '_', (byPhase.get(r.phaseKey ?? '_') ?? 0) + r.hours);
  });

  const summCell = (label: string, value: string, sub = '') => `
    <div class="rounded-lg border border-line bg-canvas/50 p-3">
      <div class="text-[11px] text-ink-faint">${label}</div>
      <div class="text-[20px] font-semibold text-ink mt-0.5">${value}</div>
      ${sub ? `<div class="text-[10px] text-ink-faint mt-0.5">${sub}</div>` : ''}
    </div>`;

  const listRow = (title: string, data: [string, number][]) => `
    <div class="text-[12px]">
      <div class="text-ink-faint mb-1">${title}</div>
      ${data.map(([k, v]) => `
        <div class="flex items-center justify-between py-1 border-b border-hair last:border-0">
          <span class="text-ink">${esc(k)}</span>
          <span class="font-medium text-ink-soft">${v.toFixed(1)}h</span>
        </div>`).join('') || `<div class="text-ink-faint">暂无</div>`}
    </div>`;

  const tableRows = [...rows]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(r => {
      const ph = r.phaseKey ? PHASE_META[r.phaseKey as PhaseKey] : null;
      return `<tr class="border-b border-hair last:border-0">
        <td class="px-3 py-2 text-[12px] text-ink whitespace-nowrap">${esc(r.date)}</td>
        <td class="px-3 py-2 text-[12px] text-ink-soft">${ph ? esc(ph.name) : '—'}</td>
        <td class="px-3 py-2 text-[12px] text-ink">${esc(r.taskName)}</td>
        <td class="px-3 py-2 text-[12px] text-ink-soft">${esc(r.worker)}</td>
        <td class="px-3 py-2 text-[12px] font-medium text-ink text-right whitespace-nowrap">${r.hours.toFixed(1)}h</td>
        <td class="px-3 py-2 text-[11px] text-ink-faint">${esc(r.note ?? '')}</td>
        <td class="px-3 py-2 text-right"><button class="btn-ghost text-[#C00000]" data-hr-del="${r.id}" title="删除">${icon('x', 13)}</button></td>
      </tr>`;
    })
    .join('');

  host.innerHTML = `
  <div class="card overflow-hidden">
    <div class="px-4 py-3 border-b border-hair flex items-center justify-between">
      <div class="flex items-center gap-2 text-[14px] font-semibold text-ink">${icon('clock', 15)} 工时统计 <span class="text-[11px] font-normal text-ink-faint">（插件）</span></div>
      <button class="btn" data-hr-export>${icon('export', 13)} 导出 Excel</button>
    </div>

    <div class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${summCell('累计工时', totalH.toFixed(1) + 'h', `${rows.length} 条记录`)}
      ${summCell('本月', rows.filter(r => r.date.slice(0, 7) === todayISO().slice(0, 7)).reduce((s, r) => s + r.hours, 0).toFixed(1) + 'h', todayISO().slice(0, 7))}
      ${listRow('按人员', [...byPerson.entries()])}
      ${listRow('按阶段', [...byPhase.entries()])}
    </div>

    <div class="px-4 pb-4 space-y-3">
      <div class="rounded-lg border border-line p-3 bg-brand-light/20">
        <div class="text-[12px] font-semibold text-ink mb-2 flex items-center gap-1.5">${icon('plus', 13)} 新增工时记录</div>
        <div class="grid grid-cols-2 md:grid-cols-6 gap-2 items-center">
          <input type="date" class="input !py-1.5" data-hr-date value="${todayISO()}">
          <select class="input !py-1.5" data-hr-phase>${phaseOpts}</select>
          <input class="input !py-1.5 md:col-span-2" data-hr-task placeholder="任务 / 事项">
          <select class="input !py-1.5" data-hr-worker>
            <option value="">选择人员</option>${workerOpts}
          </select>
          <div class="flex gap-2">
            <input type="number" class="input !py-1.5 w-20" data-hr-hours min="0.5" step="0.5" value="1">
            <button class="btn btn-primary !py-1.5" data-hr-add>${icon('check', 14)} 记录</button>
          </div>
        </div>
        <input class="input !py-1.5 mt-2" data-hr-note placeholder="工作说明（可选）">
      </div>

      <div class="overflow-x-auto"><table class="w-full">
        <thead><tr class="bg-canvas/60 text-left">
          <th class="px-3 py-2 text-[11px] text-ink-faint font-medium">日期</th>
          <th class="px-3 py-2 text-[11px] text-ink-faint font-medium">阶段</th>
          <th class="px-3 py-2 text-[11px] text-ink-faint font-medium">任务/事项</th>
          <th class="px-3 py-2 text-[11px] text-ink-faint font-medium">人员</th>
          <th class="px-3 py-2 text-[11px] text-ink-faint font-medium text-right">工时</th>
          <th class="px-3 py-2 text-[11px] text-ink-faint font-medium">说明</th>
          <th class="px-3 py-2"></th>
        </tr></thead>
        <tbody>${tableRows || `<tr><td colspan="7" class="px-3 py-6 text-center text-[12px] text-ink-faint">暂无工时记录</td></tr>`}</tbody>
      </table></div>
    </div>
  </div>`;

  // 事件
  host.querySelector('[data-hr-add]')?.addEventListener('click', () => {
    const date = (host.querySelector('[data-hr-date]') as HTMLInputElement).value || todayISO();
    const phaseKey = (host.querySelector('[data-hr-phase]') as HTMLSelectElement).value || undefined;
    const taskName = (host.querySelector('[data-hr-task]') as HTMLInputElement).value.trim();
    const worker = (host.querySelector('[data-hr-worker]') as HTMLSelectElement).value;
    const hours = Number((host.querySelector('[data-hr-hours]') as HTMLInputElement).value);
    const note = (host.querySelector('[data-hr-note]') as HTMLInputElement).value.trim();
    if (!worker) return alert('请选择人员');
    if (!taskName) return alert('请填写任务/事项');
    if (!hours || hours <= 0) return alert('请填写有效工时');
    addHour({
      id: `hr-${Date.now()}`,
      projectId,
      phaseKey,
      taskName,
      worker,
      date,
      hours,
      note,
    });
  });

  host.querySelectorAll('[data-hr-del]').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-hr-del')!;
      if (window.confirm('确认删除该工时记录？')) removeHour(id);
    }),
  );

  host.querySelector('[data-hr-export]')?.addEventListener('click', () => {
    const head: (string | number)[][] = [
      ['日期', '阶段', '任务/事项', '人员', '工时(h)', '说明'],
      ...rows.map(r => [
        r.date,
        r.phaseKey ? PHASE_META[r.phaseKey as PhaseKey].name : '',
        r.taskName,
        r.worker,
        r.hours,
        r.note ?? '',
      ]),
    ];
    void exportXlsx(`工时统计_${p.name}_${fmtISO(new Date().toISOString())}.xlsx`, '工时统计', head);
  });

  // 人员输入提示（支持手动输入不在团队内的人员）
  const workerEl = host.querySelector('[data-hr-worker]') as HTMLSelectElement | null;
  if (workerEl) {
    const datalist = document.createElement('datalist');
    datalist.id = 'hr-workers';
    workerList.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      datalist.appendChild(o);
    });
    host.appendChild(datalist);
  }
}