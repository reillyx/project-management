// 项目列表（一级视图）
import { activeStageIndex, addProject, collectReminders, getProjects, getTeam, navigate, removeProject, updateProject } from '../store';
import { PHASE_META, PHASE_KEYS, LEVEL_META_PROJECT, ROLE_META, type Project, type ProjectStage, type PhaseKey } from '../data/types';
import { addDays, fmtDate, fmtMoney, LEVEL_META, todayISO } from '../lib';
import { USAGE_DIRS } from '../data/mock';
import { badge, contactBlock, esc, icon, progressBar, toast } from '../ui';
import { exportProjectDetail } from './export';

export interface ProjectForm {
  name: string;
  code: string;
  customer: string;
  category: string;
  priority: Project['priority'];
  clientName: string;
  clientTel: string;
  planStart: string;
  planEnd: string;
  teamOf?: Project['teamOf'];
}

/** 生成有规律的自动编号：IT-<年份>-<当年序号，3位补零> */
function nextCode(): string {
  const year = new Date().getFullYear();
  const prefix = `IT-${year}-`;
  let max = 0;
  for (const x of getProjects()) {
    if (x.code?.startsWith(prefix)) {
      const n = parseInt(x.code.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function createEmptyProject(form: ProjectForm): Project {
  const base = form.planStart || todayISO();
  const stages: ProjectStage[] = PHASE_KEYS.map((k: PhaseKey, i: number) => {
    const planStart = i === 0 ? base : addDays(base, i * 7);
    const s: ProjectStage = {
      key: k,
      planStart,
      planEnd: addDays(planStart, 6),
      status: i === 0 ? 'active' : 'pending',
    };
    if (i === 0) s.actualStart = base;
    return s;
  });
  const filesDir: Record<string, Record<string, never[]>> = {};
  PHASE_KEYS.forEach(k => {
    filesDir[k] = {};
    USAGE_DIRS[k].forEach(f => (filesDir[k][f] = []));
  });
  const fallbackEnd = stages[stages.length - 1].planEnd;
  const planEnd = form.planEnd || fallbackEnd;
  const aName = form.clientName.trim() || '待定';
  const aTel = form.clientTel.trim() || '—';
  const clients = aName !== '待定' || aTel !== '—'
    ? [{ id: `clt${Date.now()}`, name: aName, tel: aTel }]
    : [];
  const p: Project = {
    id: `p${Date.now()}`,
    code: form.code || nextCode(),
    name: form.name || '未命名项目',
    customer: form.customer || '',
    category: form.category || '',
    manager: '—',
    contacts: {
      a: { party: '甲方', name: aName, tel: aTel },
      b: { party: '乙方', name: '待定', tel: '—', role: 'tech' },
    },
    ...(clients.length ? { clients } : {}),
    ...(form.teamOf ? { teamOf: form.teamOf } : {}),
    startDate: stages[0].planStart,
    endDate: planEnd,
    progress: 0,
    planStart: stages[0].planStart,
    planEnd,
    stages,
    tasks: [],
    filesDir: filesDir as Record<string, Record<string, never[]>>,
    priority: form.priority || 'normal',
    budget: '',
  };
  return p;
}

export function renderProjects(root: HTMLElement): void {
  const projects = getProjects();
  renderProjectsInner(root, projects, '', '');
}

function renderProjectsInner(
  root: HTMLElement,
  projects: Project[],
  stageFilter: string,
  levelFilter: string,
): void {
  const reminders = collectReminders();
  const alertOf = (pid: string): { level: 'overdue' | 'urgent' | 'warning' } | null => {
    const list = reminders.filter(r => r.projectId === pid);
    if (list.length === 0) return null;
    list.sort((a, b) => a.days - b.days);
    return { level: list[0].level };
  };

  // 筛选
  const filtered = projects.filter(p => {
    const ai = activeStageIndex(p);
    const curKey = p.stages[ai]?.key;
    if (stageFilter !== '' && curKey !== stageFilter) return false;
    if (levelFilter !== '' && (p.level ?? '') !== levelFilter) return false;
    return true;
  });

  const rows = filtered
    .map(p => {
      const ai = activeStageIndex(p);
      const cur = p.stages[ai];
      const alert = alertOf(p.id);
      const alertCell = alert
        ? badge(LEVEL_META[alert.level].label, LEVEL_META[alert.level].color, LEVEL_META[alert.level].bg)
        : '<span class="text-ink-faint">—</span>';
      const lv = p.level ? LEVEL_META_PROJECT[p.level] : null;
      const contractCell = p.contract
        ? `<span class="text-[12px] text-brand-deep inline-flex items-center gap-1 editable-cell" data-no-nav data-field="contractNo" data-type="text" data-value="${esc(p.contract.no)}" style="cursor:pointer">${icon('doc', 13)}${esc(p.contract.no || '—')}</span>`
        : '<span class="text-ink-faint text-[12px]">无</span>';
      return `<tr class="border-b border-hair hover:bg-brand-soft/50 transition-colors" data-pid="${p.id}" style="cursor:pointer">
        <td class="table-td w-8" style="cursor:default" onClick="event.stopPropagation()">
          <input type="checkbox" data-batch-pid="${p.id}" class="pl-chk accent-[#5B9BD5]" />
        </td>
        <td class="table-td">
          <div class="text-[13px] font-medium text-ink editable-cell" data-no-nav data-field="name" data-type="text" data-value="${esc(p.name)}">${esc(p.name)}</div>
          <div class="text-[11px] text-ink-faint mt-0.5">${esc(p.code)} · ${esc(p.customer || '客户待完善')}</div>
        </td>
        <td class="table-td">${contactBlock(p)}</td>
        <td class="table-td">
          <div class="w-36 space-y-1">
            <div class="text-[11px] text-ink-soft flex justify-between"><span>${cur ? PHASE_META[cur.key].name : '已完成'}</span><span class="editable-cell" data-no-nav data-field="progress" data-type="number" data-value="${p.progress}">${p.progress}%</span></div>
            ${progressBar(p.progress, cur ? PHASE_META[cur.key].color : '#70AD47')}
          </div>
        </td>
        <td class="table-td text-[12px] text-ink-soft">
          <div class="editable-cell" data-no-nav data-field="planStart" data-type="date" data-value="${p.planStart}">${fmtDate(p.planStart)}</div>
          <div class="editable-cell" data-no-nav data-field="planEnd" data-type="date" data-value="${p.planEnd}">${fmtDate(p.planEnd)}</div>
        </td>
        <td class="table-td">${contractCell}</td>
        <td class="table-td">
          <div class="text-[12px] text-ink font-medium editable-cell" data-no-nav data-field="budget" data-type="money" data-value="${esc(p.budget)}">${fmtMoney(p.budget)}</div>
          <div class="mt-0.5 inline-flex items-center gap-1">
            ${lv ? `<span class="px-1 py-px rounded text-[10px] font-semibold editable-cell" data-no-nav data-field="level" data-type="select" data-value="${esc(p.level ?? '')}" data-options="${encodeURIComponent(JSON.stringify([['A', 'A 级'], ['B', 'B 级'], ['C', 'C 级']]))}" style="color:${lv.color};background:${lv.bg}">${esc(p.level ?? '')} 级</span>` : ''}
            <span class="text-[10px] px-1 py-px rounded editable-cell" data-no-nav data-field="thirdParty" data-type="select" data-value="${p.thirdParty === 'yes' ? 'yes' : 'no'}" data-options="${encodeURIComponent(JSON.stringify([['yes', '对接三方'], ['no', '无三方']]))}" style="background:${p.thirdParty === 'yes' ? '#EAF3FB' : '#EEF2F7'};color:${p.thirdParty === 'yes' ? '#3D74A8' : '#6B7A90'}">${p.thirdParty === 'yes' ? '对接三方' : '无三方'}</span>
          </div>
        </td>
        <td class="table-td">${alertCell}</td>
        <td class="table-td" style="cursor:default" data-no-nav>
          <div class="flex items-center gap-1">
            <a href="#/files/${p.id}" class="btn-ghost p-1.5" data-no-nav title="文件管理">${icon('folder', 14)}</a>
            <a href="#/project/${p.id}" class="btn-ghost p-1.5" data-no-nav title="项目详情">${icon('list', 14)}</a>
            <a href="#/gantt/${p.id}" class="btn-ghost p-1.5" data-no-nav title="阶段甘特">${icon('calendar', 14)}</a>
            <button class="prj-del btn-ghost p-1.5" data-del="${p.id}" data-no-nav title="删除项目">${esc('删')}</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  root.innerHTML = `
  <div class="max-w-[1280px] mx-auto space-y-4 view-enter">
    <div class="flex items-center gap-3 flex-wrap">
      <div class="flex-1 min-w-[220px]">
        <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('list', 17)} 项目列表 <span class="text-[12px] font-normal text-ink-faint">（${filtered.length} 项）</span></div>
      </div>
      <div class="flex items-center gap-2">
        <div class="input flex items-center gap-2 px-2.5 py-1.5 w-56">
          <span class="text-ink-faint">${icon('search', 14)}</span>
          <input id="projSearch" class="outline-none text-[13px] w-full bg-transparent" placeholder="搜索项目 / 编号 / 客户" />
        </div>
        <button id="projNew" class="btn-primary">${icon('plus', 14)} 新建项目</button>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-2.5 border-b border-hair bg-canvas/50 flex-wrap" id="filters">
        <span class="text-[12px] text-ink-faint">筛选：</span>
        <select id="fStage" class="input py-1.5 w-40">
          <option value="">全部阶段</option>
          ${PHASE_KEYS.map(k => `<option value="${k}" ${stageFilter === k ? 'selected' : ''}>${PHASE_META[k].name}</option>`).join('')}
        </select>
        <select id="fLevel" class="input py-1.5 w-32">
          <option value="">全部等级</option>
          ${(['A', 'B', 'C'] as const)
            .map(l => `<option value="${l}" ${levelFilter === l ? 'selected' : ''}>${l} 级</option>`)
            .join('')}
        </select>
        <div id="batchBar" class="hidden items-center gap-2 ml-auto text-[12px]">
          <span class="text-ink-soft">已选 <b id="bn" class="text-brand-deep">0</b> 项</span>
          <button id="batchExport" class="btn py-1 px-2.5">${icon('export', 13)} 导出明细</button>
          <button id="batchDoc" class="btn py-1 px-2.5">${icon('doc', 13)} 批量生成文档</button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse min-w-[980px]">
          <thead class="bg-canvas/60">
            <tr>
              <th class="table-th w-8"></th>
              <th class="table-th">项目</th>
              <th class="table-th">项目对接人</th>
              <th class="table-th">当前阶段 / 进度</th>
              <th class="table-th">计划周期</th>
              <th class="table-th">合同</th>
              <th class="table-th">金额 / 等级 / 三方</th>
              <th class="table-th">到期预警</th>
              <th class="table-th">操作</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="empty" class="${filtered.length ? 'hidden' : ''} px-4 py-12 text-center text-ink-faint">暂无符合条件的项目</div>
    </div>
  </div>`;

  // 行点击（操作列不触发跳转）
  root.querySelectorAll('tr[data-pid]').forEach(tr => {
    tr.addEventListener('click', ev => {
      const target = ev.target as HTMLElement;
      if (target.closest('[data-no-nav]')) return;
      const pid = tr.getAttribute('data-pid');
      if (pid) navigate(`#/project/${pid}`);
    });
  });

  // 删除项目
  root.querySelectorAll('.prj-del').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      const pid = btn.getAttribute('data-del');
      if (!pid) return;
      if (window.confirm('确定删除该项目吗？其阶段、任务与附件记录将一并移除。')) {
        removeProject(pid);
        toast('项目已删除');
      }
    });
  });

  const batchBar = root.querySelector('#batchBar') as HTMLElement | null;
  const updateBatch = (): void => {
    const n = root.querySelectorAll<HTMLInputElement>('.pl-chk:checked').length;
    const bn = root.querySelector('#bn');
    if (bn) bn.textContent = String(n);
    if (batchBar) batchBar.classList.toggle('flex', n > 0);
  };
  const batchIds = (): string[] =>
    Array.from(root.querySelectorAll<HTMLInputElement>('.pl-chk:checked')).map(
      c => c.getAttribute('data-batch-pid') ?? '',
    );
  root.querySelectorAll<HTMLInputElement>('.pl-chk').forEach(ch =>
    ch.addEventListener('change', updateBatch),
  );
  // 行内编辑：点击可编辑字段 → 就地编辑，回车/失焦保存，Esc 取消
  const clampN = (v: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : 0)));
  const commitCell = (field: string, id: string, v: string): void => {
    switch (field) {
      case 'name': updateProject(id, { name: v }); break;
      case 'progress': updateProject(id, { progress: clampN(Number(v), 0, 100) }); break;
      case 'planStart': updateProject(id, { planStart: v }); break;
      case 'planEnd': updateProject(id, { planEnd: v }); break;
      case 'budget': {
        const curP = getProjects().find(x => x.id === id);
        const c = curP?.contract ?? { no: '', name: '', amount: '', signDate: '', payment: '' };
        updateProject(id, { budget: v, contract: { ...c, amount: v } });
        break;
      }
      case 'contractNo': {
        const curP = getProjects().find(x => x.id === id);
        const c = curP?.contract ?? { no: '', name: '', amount: '', signDate: '', payment: '' };
        updateProject(id, { contract: { ...c, no: v } });
        break;
      }
      case 'level': updateProject(id, { level: v as Project['level'] }); break;
      case 'thirdParty': updateProject(id, { thirdParty: v as Project['thirdParty'] }); break;
      default: return;
    }
    toast('已保存');
  };
  root.querySelectorAll<HTMLElement>('[data-field]').forEach((cell) => {
    cell.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = cell.closest('tr[data-pid]')?.getAttribute('data-pid') ?? '';
      if (!id) return;
      const original = cell.innerHTML;
      let cancelled = false;
      const commit = (v: string): void => { if (!cancelled) commitCell(cell.dataset.field || '', id, v); };
      let control: HTMLInputElement | HTMLSelectElement;
      if ((cell.dataset.type ?? 'text') === 'select') {
        control = document.createElement('select');
        control.className = 'input';
        let opts: [string, string][] = [];
        try { opts = JSON.parse(decodeURIComponent(cell.dataset.options || '[]')) as [string, string][]; } catch { opts = []; }
        opts.forEach(([v, label]) => {
          const o = document.createElement('option');
          o.value = v; o.textContent = label; o.selected = v === (cell.dataset.value ?? '');
          control.appendChild(o);
        });
        control.addEventListener('change', () => commit(control.value));
      } else {
        control = document.createElement('input');
        control.className = 'input w-28';
        if ((cell.dataset.type ?? '') === 'date') control.type = 'date';
        else if ((cell.dataset.type ?? '') === 'number') { control.type = 'number'; control.min = '0'; control.max = '100'; }
        else control.type = 'text';
        const cellType = cell.dataset.type ?? '';
        if (cellType === 'date') control.value = cell.dataset.value ?? '';
        else if (cellType === 'money' || cellType === 'number') control.value = (cell.dataset.value ?? '').replace(/[^0-9.]/g, '');
        else if (cellType === 'text') control.value = cell.dataset.value ?? '';
        else control.value = (cell.dataset.value ?? '').replace(/[^\d]/g, '');
        if (cellType === 'money') {
          control.inputMode = 'decimal';
          control.step = '0.01';
          control.addEventListener('input', () => {
            const prev = control.value;
            const v = control.value.replace(/[^0-9.]/g, '').replace(/\.{2,}/g, '.').replace(/^\./, '0.').replace(/(\.\d{2})\d+/, '$1');
            control.value = v;
            if (control.value !== prev && control instanceof HTMLInputElement) control.setSelectionRange(control.value.length, control.value.length);
          });
          control.addEventListener('keydown', (e) => {
            if ((e.key.length === 1 && e.key !== '.' && !/[0-9]/.test(e.key)) && !e.ctrlKey && !e.metaKey) e.preventDefault();
          });
        }
        control.addEventListener('blur', () => commit(control.value));
        control.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); control.blur(); }
          else if (e.key === 'Escape') { cancelled = true; cell.innerHTML = original; }
        });
      }
      cell.innerHTML = '';
      cell.appendChild(control);
      control.focus();
      if (control instanceof HTMLInputElement && control.type !== 'number') {
        control.setSelectionRange(control.value.length, control.value.length);
      }
    });
  });

  root.querySelector('#batchExport')?.addEventListener('click', () => {
    const ids = batchIds();
    if (!ids.length) return;
    ids.forEach(id => exportProjectDetail(id));
  });
  root.querySelector('#batchDoc')?.addEventListener('click', () => {
    const ids = batchIds();
    if (!ids.length) return;
    toast(`已选择 ${ids.length} 个项目，可在「文档模板」中选择模板批量生成`);
    navigate('#/templates');
  });

  // 筛选
  const fStage = root.querySelector('#fStage') as HTMLSelectElement | null;
  const fLevel = root.querySelector('#fLevel') as HTMLSelectElement | null;
  const applyFilter = (): void => {
    renderProjectsInner(root, projects, fStage?.value ?? '', fLevel?.value ?? '');
  };
  fStage?.addEventListener('change', applyFilter);
  fLevel?.addEventListener('change', applyFilter);

  // 搜索过滤
  const search = root.querySelector('#projSearch') as HTMLInputElement | null;
  search?.addEventListener('input', () => {
    const q = (search.value || '').trim().toLowerCase();
    root.querySelectorAll<HTMLElement>('tr[data-pid]').forEach(tr => {
      const text = (tr.textContent || '').toLowerCase();
      tr.style.display = !q || text.includes(q) ? '' : 'none';
    });
    const visible = Array.from(root.querySelectorAll('tr[data-pid]')).some(
      tr => (tr as HTMLElement).style.display !== 'none',
    );
    const empty = root.querySelector('#empty');
    if (empty) empty.classList.toggle('hidden', visible);
  });

  const newBtn = root.querySelector('#projNew');
  newBtn?.addEventListener('click', () => openNewModal(root));
}

export function openNewModal(root: HTMLElement): void {
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="bg-white rounded-lg w-[480px] max-w-full shadow-xl border border-line">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-hair">
        <div class="text-[15px] font-semibold text-ink">${icon('plus', 16)} 新建项目</div>
        <button class="modal-close btn-ghost">${icon('x', 16)}</button>
      </div>
      <div class="px-5 py-4 space-y-3.5">
        <div>
          <label class="field-label">项目名称 *</label>
          <input id="np-name" class="input w-full" placeholder="如：XX 办公楼智能门禁系统项目" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label">项目编号</label>
            <input id="np-code" class="input w-full read-only" value="${nextCode()}" readonly title="自动生成的编号" />
          </div>
          <div>
            <label class="field-label">客户名称</label>
            <input id="np-customer" class="input w-full" placeholder="请输入客户名称" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label">计划开始 *</label>
            <input id="np-plan-start" type="date" class="input w-full" value="${todayISO()}" required />
          </div>
          <div>
            <label class="field-label">计划交付 <span class="text-ink-faint font-normal">（可不填）</span></label>
            <input id="np-plan-end" type="date" class="input w-full" />
          </div>
        </div>
        <div>
          <label class="field-label">优先级</label>
          <select id="np-priority" class="input w-full">
            <option value="normal">普通</option>
            <option value="high">重要</option>
            <option value="urgent">紧急</option>
          </select>
        </div>
        <div class="text-[11px] text-ink-faint bg-brand-soft/60 border border-brand/20 rounded-md px-2.5 py-2">其余信息（对接人、我方对接人员、合同、业务类别等）可在项目详情页中补充完善。</div>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3.5 border-t border-hair bg-canvas/40 rounded-b-lg">
        <button class="modal-close btn">取消</button>
        <button id="np-submit" class="btn-primary">创建项目</button>
      </div>
    </div>`;
  document.body.appendChild(bg);

  const close = () => bg.remove();
  bg.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', close));
  bg.addEventListener('click', e => {
    if (e.target === bg) close();
  });
  bg.querySelector('#np-submit')?.addEventListener('click', () => {
    const name = (bg.querySelector('#np-name') as HTMLInputElement).value.trim();
    const code = (bg.querySelector('#np-code') as HTMLInputElement).value.trim();
    const customer = (bg.querySelector('#np-customer') as HTMLInputElement).value.trim();
    const priority = (bg.querySelector('#np-priority') as HTMLSelectElement).value as Project['priority'];
    const planStart = (bg.querySelector('#np-plan-start') as HTMLInputElement).value;
    const planEnd = (bg.querySelector('#np-plan-end') as HTMLInputElement).value;
    if (!name) {
      alert('请输入项目名称');
      return;
    }
    if (!planStart) {
      alert('请填写计划开始时间');
      return;
    }
    const p = createEmptyProject({ name, code, customer, category: '', priority, clientName: '', clientTel: '', planStart, planEnd });
    addProject(p);
    close();
    navigate(`#/project/${p.id}`);
  });
}