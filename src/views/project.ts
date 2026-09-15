// 项目详情页（概览 / 对接人 / 阶段看板 / 任务）
import { activeStageIndex, addLog, collectReminders, getLogs, getProject, getTeam, navigate, removeProject, updateProject, updateStage } from '../store';
import {
  PHASE_KEYS,
  PHASE_META,
  ROLE_META,
  type Contact,
  type PhaseKey,
  type Project,
  type ProjectStage,
  type ProjectTask,
  type StageStatus,
  type TaskStatus,
} from '../data/types';
import { daysUntil, fmtDate, fmtMoney, LEVEL_META } from '../lib';
import { setDirtyApp } from '../guard';

let stageTaskLimit = 8; // 当前阶段任务默认展示条数
let stageLogLimit = 6; // 项目日志默认展示条数
let stageLogExpanded = false; // 项目日志是否展开全部

type OurRole = 'tech' | 'sales' | 'dev';

function ownerChips(value: string): string {
  const team = getTeam();
  const names = value.split(',').map(name => name.trim()).filter(Boolean);
  if (!names.length) return '<span class="text-ink-faint">未分配</span>';
  return names.map(name => {
    const member = team.find(item => item.name === name);
    const role = member?.roles[0];
    const color = role ? ROLE_META[role].color : '#718096';
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] text-white mr-1" style="background:${color}">${esc(name)}</span>`;
  }).join('');
}

function ownerOptions(selected: string): string {
  const names = new Set(selected.split(',').map(name => name.trim()).filter(Boolean));
  return getTeam().map(member => {
    const color = ROLE_META[member.roles[0]].color;
    return `<label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-canvas cursor-pointer">
      <input type="checkbox" data-owner-id="${esc(member.id)}" value="${esc(member.name)}" ${names.has(member.name) ? 'checked' : ''}>
      <span class="w-2.5 h-2.5 rounded-full" style="background:${color}"></span><span>${esc(member.name)}</span>
    </label>`;
  }).join('');
}

function openOwnerModal(root: HTMLElement, selected: string, onSave: (value: string) => void): void {
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `<div class="modal" style="max-width:420px">
    <div class="px-4 py-3 border-b border-line flex items-center justify-between">
      <span class="text-[15px] font-semibold text-ink">选择负责人（可多选）</span>
      <button class="text-ink-faint hover:text-ink" data-owner-close>${icon('x', 16)}</button>
    </div>
    <div class="p-4"><div class="border border-line rounded-md p-1 max-h-56 overflow-y-auto">${ownerOptions(selected) || '<span class="text-ink-faint text-[12px]">暂无团队成员</span>'}</div></div>
    <div class="flex justify-end gap-2 px-4 py-3 border-t border-line"><button class="btn" data-owner-cancel>取消</button><button class="btn-primary" data-owner-save>保存</button></div>
  </div>`;
  const close = (): void => bg.remove();
  bg.addEventListener('click', event => { if (event.target === bg) close(); });
  bg.querySelector('[data-owner-close]')?.addEventListener('click', close);
  bg.querySelector('[data-owner-cancel]')?.addEventListener('click', close);
  bg.querySelector('[data-owner-save]')?.addEventListener('click', () => {
    const value = Array.from(bg.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')).map(input => input.value).join(', ');
    onSave(value);
    close();
  });
  root.appendChild(bg);
}
import {
  contactBlock,
  esc,
  icon,
  priorityBadge,
  progressBar,
  taskStatusBadge,
  toast,
} from '../ui';
import { openGenModal } from './template-gen';
import { openPreview, downloadDataUrl, dataUrlSize } from './preview';
import { isOn } from '../plugins/registry';
import { mountHours } from '../plugins/hours';
import { autoNotifyOnStage, genNotifyDoc, type NotifyType } from '../plugins/notify';
import { getProductCatalog, getProductIntegrates, getProductSystems } from '../data/resourceConfig';

export function renderProjectDetail(root: HTMLElement, id: string): void {
  const p = getProject(id);
  if (!p) {
    root.innerHTML = `<div class="card p-10 text-center text-ink-faint">未找到该项目</div>`;
    return;
  }

  const reminders = collectReminders().filter(r => r.projectId === id);
  const alertBlocks = reminders
    .map(r => {
      const m = LEVEL_META[r.level];
      const d = daysUntil(r.date);
      return `<div class="flex items-center gap-2 text-[12px]">
        <span class="w-1.5 h-1.5 rounded-full" style="background:${m.color}"></span>
        <span style="color:${m.color}" class="font-medium">${m.label}</span>
        <span class="text-ink-soft">${esc(r.title)} · ${fmtDate(r.date)}${d < 0 ? ` · 已逾期${-d}天` : ''}</span>
      </div>`;
    })
    .join('');

  const overview = (label: string, value: string, ef?: { key: string; raw: string; num?: boolean }) => `
    <div class="px-4 py-3">
      <div class="text-[11px] text-ink-faint">${label}</div>
      <div class="text-[13px] font-medium text-ink mt-0.5${ef ? ' editable' : ''}"${ef ? ` data-edit="${ef.key}" data-evalue="${esc(ef.raw)}"${ef.num ? ' data-numeric="1"' : ''}` : ''}>${esc(value)}${ef ? `<span class="pencil-hint">${icon('edit', 11)}</span>` : ''}</div>
    </div>`;

  const timelineNodes = p.stages
    .map(st => {
      const m = PHASE_META[st.key];
      const color = st.status === 'pending' ? '#C5CEDA' : st.status === 'done' ? '#70AD47' : '#5B9BD5';
      const active = st.status === 'active';
      return `<div class="flex flex-col items-center relative shrink-0 cursor-pointer" data-stage-node="${st.key}" style="width:168px">
        <div class="relative flex items-center justify-center" style="height:22px">
          <div class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white cursor-pointer ${active ? 'ring-4 ring-brand/25' : 'ring-2 ring-white'}" data-stage-status="${st.key}" style="background:${color}">${st.status === 'done' ? icon('check', 10) : ''}</div>
        </div>
        <div class="mt-2 text-center">
          <div class="text-[12.5px] ${active ? 'text-brand-deep font-bold' : 'font-semibold text-ink'}">${m.name}</div>
          <div class="mt-1.5 flex flex-col items-stretch gap-1 w-full px-1" onclick="event.stopPropagation()">
            <label class="flex items-center gap-1.5"><span class="text-[11px] text-ink-faint shrink-0">始</span><input type="date" class="stage-date-input" data-stage-start="${st.key}" value="${st.planStart || ''}" title="点击编辑计划开始日期"></label>
            <label class="flex items-center gap-1.5"><span class="text-[11px] text-ink-faint shrink-0">止</span><input type="date" class="stage-date-input" data-stage-end="${st.key}" value="${st.planEnd || ''}" title="点击编辑计划结束日期"></label>
          </div>
        </div>
      </div>`;
    })
    .join('');

  const activeStage = p.stages[activeStageIndex(p)];
  const allStageTasks = activeStage ? p.tasks.filter(t => t.phase === activeStage.key) : [];
  const stageTasks = allStageTasks.slice(0, stageTaskLimit);
  const hasMore = allStageTasks.length > 8;
  const moreRow = hasMore ? `<tr class="border-0"><td colspan="5" class="p-1.5 text-center"><button data-stage-more class="text-[12px] font-medium text-brand-deep hover:underline">${stageTaskLimit === 8 ? `显示全部 ${allStageTasks.length} 条` : '收起'}</button></td></tr>` : '';

  const taskRows = stageTasks
    .map(t => `
      <tr class="border-b border-hair last:border-0" data-tid="${t.id}">
        <td class="table-td">
          <span class="editable-cell" data-task-field="name" data-tid="${t.id}">${esc(t.name)}<span class="pencil-hint">${icon('edit', 10)}</span></span>${t.milestone ? ` <span class="text-[#B8860B]">${icon('star', 12)}</span>` : ''}
        </td>
        <td class="table-td"><span class="editable-cell" data-task-field="owner" data-tid="${t.id}">${ownerChips(t.owner)}</span></td>
        <td class="table-td"><span class="editable-cell" data-task-field="status" data-tid="${t.id}">${taskStatusBadge(t.status)}</span></td>
        <td class="table-td"><span class="editable-cell" data-task-field="progress" data-tid="${t.id}">${t.progress}%</span></td>
        <td class="table-td text-right whitespace-nowrap">
          <input type="date" class="inline-edit-date w-[124px]" data-task-start="${t.id}" value="${t.start}" title="计划开始">
          <button class="btn-ghost text-[#C00000] ml-1" data-task-del="${t.id}" title="删除任务">${icon('x', 13)}</button>
        </td>
      </tr>`)
    .join('');

  const products = p.products ?? [];
  const systems = p.systems ?? [];
  const integrates = p.integrates ?? [];
  const devRows = products.length
    ? products.map(item => `<div class="flex items-center gap-2 px-2 py-2 border-b border-hair last:border-b-0 group/prod hover:bg-brand-soft/40 transition-colors" data-product-id="${esc(item.id)}">
        <span class="text-[13px] font-medium text-ink truncate">${esc(item.name) || '<span class="text-ink-faint">未命名设备</span>'}</span>
        <span class="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-brand-soft text-brand-deep">${esc(item.spec) || '—'} × ${esc(item.qty) || '1'}台</span>
        <span class="ml-auto flex items-center gap-2 opacity-0 group-hover/prod:opacity-100 transition-opacity shrink-0">
          <button class="text-brand-deep hover:underline text-[12px]" data-product-edit="${esc(item.id)}">编辑</button>
          <button class="text-[#C00000] hover:underline text-[12px]" data-product-del="${esc(item.id)}">删除</button>
        </span>
      </div>`).join('')
    : `<div class="px-2 py-6 text-center text-[12px] text-ink-faint">暂无设备<br>点击「添加设备」</div>`;
  const sysRows = systems.length
    ? systems.map(s => `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-soft text-[12px] font-medium text-brand-deep group/sys">${esc(s.name)} <b class="text-[11px] text-brand">v${esc(s.version)}</b><button class="text-brand-deep/50 hover:text-[#C00000] transition-colors" data-system-del="${esc(s.id)}" title="删除">${icon('x', 12)}</button></span>`).join('')
    : '<span class="text-[12px] text-ink-faint">暂无</span>';
  const intRows = integrates.length
    ? integrates.map(i => `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#EFF6EC] text-[12px] font-medium text-[#2F6B43] group/int">${esc(i.name)}<b class="text-[11px] text-[#70AD47]">${esc(i.target) ? '@ ' + esc(i.target) : ''}</b><button class="text-[#2F6B43]/50 hover:text-[#C00000] transition-colors" data-integrate-del="${esc(i.id)}" title="删除">${icon('x', 12)}</button></span>`).join('')
    : '<span class="text-[12px] text-ink-faint">暂无</span>';
  const productRows = `<div class="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-px bg-hair">
    <div class="bg-white min-w-0">
      <div class="px-3 py-2 text-[12px] font-semibold text-ink border-b border-hair">硬件设备</div>
      <div class="divide-y divide-hair px-0">${devRows}</div>
    </div>
    <div class="bg-white min-w-0 border-t md:border-t-0 md:border-l border-hair">
      <div class="px-3 py-2 text-[12px] font-semibold text-ink border-b border-hair">系统与集成</div>
      <div class="px-3 py-2 space-y-2">
        <div>
          <div class="text-[11px] text-ink-faint mb-1">对接系统</div>
          <div class="flex flex-wrap gap-1.5">${sysRows}</div>
        </div>
        <div>
          <div class="text-[11px] text-ink-faint mb-1">集成平台</div>
          <div class="flex flex-wrap gap-1.5">${intRows}</div>
        </div>
      </div>
    </div>
  </div>`;

  // 项目日志：取全局操作日志中本项目的记录，按时间倒序（随项目进行不断增加）
  const projectLogs = getLogs()
    .filter(l => !l.projectId || l.projectId === p.id)
    .slice()
    .reverse();
  const logLimit = stageLogLimit;
  const shownLogs = stageLogExpanded ? projectLogs : projectLogs.slice(0, logLimit);
  const logRows = shownLogs
    .map(
      l => {
        const dot = l.action === 'delete' ? '#C00000' : l.action === 'create' ? '#70AD47' : l.action === 'status' ? '#FFC000' : '#5B9BD5';
        return `<div class="flex items-start gap-2.5 px-4 py-2.5">
          <span class="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style="background:${dot}"></span>
          <div class="min-w-0">
            <div class="text-[12px] text-ink leading-snug">${esc(l.detail || l.action)}</div>
            <div class="text-[10px] text-ink-faint mt-0.5">${esc(l.time)}${l.user ? ' · ' + esc(l.user) : ''}</div>
          </div>
        </div>`;
      },
    )
    .join('') || `<div class="px-4 py-6 text-center text-[12px] text-ink-faint">暂无项目日志</div>`;
  const logMoreRow = projectLogs.length > logLimit
    ? `<button data-log-more class="w-full py-2 text-center text-[12px] text-brand-deep hover:bg-brand-soft/40 border-t border-hair">${stageLogExpanded ? '收起日志' : `查看全部 ${projectLogs.length} 条日志`}</button>`
    : '';

  const clientList: { id: string; name: string; tel: string }[] =
    p.clients?.length
      ? p.clients.map(c => ({ id: c.id, name: c.name, tel: c.tel }))
      : [{ id: `clt-${p.id}-0`, name: p.contacts.a.name, tel: p.contacts.a.tel }];
  const clientRows = clientList
    .map(
      c => `<div class="flex items-center gap-2 py-1.5 border-b border-hair last:border-0">
        <span class="editable flex-1 text-[13px] text-ink" data-client-field="name" data-cid="${c.id}" data-evalue="${esc(c.name)}">${esc(c.name)}<span class="pencil-hint">${icon('edit', 10)}</span></span>
        <span class="editable flex-1 text-[12px] text-ink-soft" data-client-field="tel" data-cid="${c.id}" data-evalue="${esc(c.tel)}">${esc(c.tel)}<span class="pencil-hint">${icon('edit', 10)}</span></span>
        <button class="btn-ghost text-[#C00000] text-[12px] shrink-0" data-client-del="${c.id}" title="删除该甲方联系人">${icon('x', 13)}</button>
      </div>`,
    )
    .join('');

  // 安排我方成员弹窗：按角色分组 + 搜索，人多时可滚动
  const teamModal = (): string => {
    const roles: OurRole[] = ['tech', 'sales', 'dev'];
    const groups = roles
      .map((r) => {
        const members = getTeam().filter((m) => m.roles.includes(r));
        if (!members.length) return '';
        const items = members
          .map((m) => {
            const on = (p.teamOf?.[r] ?? []).some((x) => x.id === m.id);
            const sub = [m.tel, m.dept].filter(Boolean).join(' · ');
            return `<label class="team-opt flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-canvas/70" data-name="${esc(m.name.toLowerCase())}">
              <input type="checkbox" class="accent-[#5B9BD5] shrink-0" data-tp-role="${r}" data-tp-id="${m.id}" ${on ? 'checked' : ''}>
              <span class="min-w-0">
                <span class="flex items-center gap-1.5 text-[13px] text-ink font-medium">
                  <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${ROLE_META[r].color}"></span>${esc(m.name)}
                </span>
                ${sub ? `<span class="block text-[11px] text-ink-faint truncate">${esc(sub)}</span>` : ''}
              </span>
            </label>`;
          })
          .join('');
        return `<div class="mb-3">
          <div class="flex items-center gap-2 px-1 mb-1.5">
            <span class="w-2 h-2 rounded-full" style="background:${ROLE_META[r].color}"></span>
            <span class="text-[12px] font-semibold" style="color:${ROLE_META[r].color}">${ROLE_META[r].label}</span>
            <span class="text-[11px] text-ink-faint">${members.length} 人</span>
          </div>
          <div class="space-y-0.5">${items}</div>
        </div>`;
      })
      .join('');
    return `<div class="modal-mask hidden" data-tp-modal>
      <div class="modal w-[440px] max-w-[92vw]">
        <div class="modal-head">
          <span class="flex items-center gap-2">${icon('users', 16)} 安排我方成员 · ${esc(p.name)}</span>
          <button class="btn py-1 px-2 text-[12px]" data-tp-close>${icon('x', 14)} 关闭</button>
        </div>
        <div class="px-4 pt-3">
          <input class="input" data-tp-search placeholder="搜索姓名 / 部门 / 电话…" />
        </div>
        <div class="modal-body max-h-[46vh] overflow-y-auto" data-tp-list>
          ${groups || '<div class="text-center text-[12px] text-ink-faint py-6">成员库暂无该角色成员，请先到「团队成员」添加</div>'}
        </div>
        <div class="modal-foot">
          <span class="text-[11px] text-ink-faint mr-auto">蓝=技术支持 / 黄=销售 / 绿=开发</span>
          <button class="btn" data-tp-cancel>取消</button>
          <button class="btn-primary" data-tp-save>保存</button>
        </div>
      </div>
    </div>`;
  };

  root.innerHTML = `
  <div class="max-w-[1200px] mx-auto space-y-4 view-enter">
    <div class="flex items-center gap-3 flex-wrap">
      <button class="btn" data-back>${icon('chevron', 12)} 返回列表</button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[16px] font-semibold text-ink editable" data-edit="name" data-evalue="${esc(p.name)}">${esc(p.name)}<span class="pencil-hint">${icon('edit', 11)}</span></span>
          ${priorityBadge(p.priority)}
        </div>
        <div class="text-[12px] text-ink-faint mt-0.5">${esc(p.code)} · ${esc(p.customer)}</div>
      </div>
      <a href="#/gantt/${p.id}" class="btn">${icon('calendar', 14)} 阶段甘特</a>
      <a href="#/gantt/${p.id}/${activeStage ? activeStage.key : 'dev'}" class="btn">${icon('list', 14)} 详细甘特</a>
      <a href="#/files/${p.id}" class="btn">${icon('folder', 14)} 文件管理</a>
      <button class="btn-primary" data-prj-gen="${p.id}">${icon('doc', 14)} 生成文档</button>
      ${isOn('notify') ? `<select data-prj-notify title="自动通知" class="input w-auto py-1 px-2 text-[12px]"><option value="">自动通知 ▾</option>${['上线通知','变更通知','会议纪要','培训通知'].map(t => `<option value="${t}">${t}</option>`).join('')}</select>` : ''}
      <span class="text-[11px] text-ink-faint self-center"></span>
      <button class="btn" data-prj-del>${icon('trash', 14)} 删除</button>
    </div>

    ${alertBlocks ? `<div class="card px-4 py-3 flex flex-col gap-1.5">${alertBlocks}</div>` : ''}

    <div class="card overflow-hidden">
      <div class="px-4 py-3 border-b border-hair text-[14px] font-semibold text-ink flex items-center gap-2">${icon('list', 15)} 阶段时间轴 <span class="text-[11px] font-normal text-ink-faint">（8 标准阶段 · 点击节点查看任务）</span></div>
      <div class="px-4 py-5 bg-canvas/40">
        <div class="relative flex items-center group/ts">
          <button class="ts-arrow absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white border border-line shadow-sm flex items-center justify-center text-ink-soft hover:text-brand-deep hover:border-brand transition-colors" data-ts="-1" aria-label="向左滚动">${icon('chevron-left', 14)}</button>
          <div class="absolute right-0 top-0 bottom-0 w-10 pointer-events-none z-[5] bg-gradient-to-l from-canvas/90 to-transparent"></div>
          <div class="absolute left-7 top-0 bottom-0 w-10 pointer-events-none z-[5] bg-gradient-to-r from-canvas/90 to-transparent"></div>
          <div class="overflow-x-auto pb-1 flex-1 px-8" id="stageScroll">
            <div class="relative flex items-start min-w-max" id="phaseTimeline">
              <div class="absolute h-[2px] bg-[#DFE7EF]" style="top:11px;left:82px;right:82px"></div>
              ${timelineNodes}
            </div>
          </div>
          <button class="ts-arrow absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white border border-line shadow-sm flex items-center justify-center text-ink-soft hover:text-brand-deep hover:border-brand transition-colors" data-ts="1" aria-label="向右滚动">${icon('chevron-right', 14)}</button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 space-y-4">
        <div class="card overflow-hidden">
          <div class="px-4 py-3 border-b border-hair flex items-center justify-between">
            <span class="text-[14px] font-semibold text-ink flex items-center gap-2">${icon('doc', 15)} 项目概览</span>
            <div class="flex items-center gap-2">
              <button class="btn py-1 px-2.5" data-team-pick title="从成员清单安排我方成员">${icon('users', 13)} 安排成员</button>
              <button class="btn py-1 px-2.5" data-client-add>${icon('plus', 13)} 添加联系人</button>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 bg-white">
            ${overview('客户单位', p.customer, { key: 'customer', raw: p.customer })}
            ${overview('计划开始', fmtDate(p.planStart), { key: 'planStart', raw: p.planStart })}
            ${overview('计划交付', fmtDate(p.planEnd), { key: 'planEnd', raw: p.planEnd })}
            <div class="px-4 py-3">
              <div class="flex items-center justify-between">
                <div class="text-[11px] text-ink-faint">总体进度（自动）</div>
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded" style="color:${projState(autoProgress(p)).color};background:${projState(autoProgress(p)).bg}">${projState(autoProgress(p)).label}</span>
              </div>
              <div class="mt-1.5 flex items-center gap-2">
                <div class="progress-track flex-1"><div class="progress-fill" style="width:${autoProgress(p)}%"></div></div>
                <span class="text-[13px] font-semibold text-ink w-[38px] text-right">${autoProgress(p)}%</span>
              </div>
            </div>
          </div>
          <div class="border-t border-hair px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-4 bg-canvas/20">
            <div class="min-w-0">
              <div class="text-[11px] text-ink-faint mb-1.5">我方对接人（点彩色标签查看联系方式）</div>
              ${contactBlock(p)}
            </div>
            <div class="min-w-0">
              <div class="text-[11px] text-ink-faint mb-1">甲方对接人</div>
              <div class="rounded-lg border border-hair px-3 py-1 bg-white">
                ${clientRows || `<div class="py-1.5 text-[12px] text-ink-faint">暂无甲方联系人，点右上「添加联系人」</div>`}
              </div>
            </div>
          </div>
          <div class="border-t border-hair">
            <div class="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <span class="text-[13px] font-semibold text-ink flex items-center gap-2">${icon('box', 14)} 产品详情 <span class="text-[11px] font-normal text-ink-faint">设备 / 系统 / 集成</span></span>
              <span class="flex items-center gap-1.5 shrink-0">
                <button class="btn py-1 px-2 text-[12px]" data-product-add>${icon('plus', 12)} 添加设备</button>
                <button class="btn py-1 px-2 text-[12px]" data-system-add>${icon('plus', 12)} 添加系统</button>
                <button class="btn py-1 px-2 text-[12px]" data-integrate-add>${icon('plus', 12)} 添加集成</button>
              </span>
            </div>
            <div class="bg-white max-h-64 overflow-y-auto" id="productRows">${productRows}</div>
          </div>
          <div class="border-t border-hair px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 bg-white">
            <div class="min-w-0">
              <div class="text-[11px] text-ink-faint mb-1 flex items-center gap-1"><span class="inline-flex items-center">${icon('edit', 11)}</span>合同名称</div>
              <div class="text-[13px] font-medium text-ink truncate editable" data-edit="contract.name" data-evalue="${esc(p.contract ? p.contract.name : '')}">${esc(p.contract ? p.contract.name : '未填')}<span class="pencil-hint">${icon('edit', 11)}</span></div>
            </div>
            <div class="min-w-0">
              <div class="text-[11px] text-ink-faint mb-1">合同编号</div>
              <div class="text-[13px] text-ink truncate editable" data-edit="contract.no" data-evalue="${esc(p.contract ? p.contract.no : '')}">${esc(p.contract ? p.contract.no : '未填')}<span class="pencil-hint">${icon('edit', 11)}</span></div>
            </div>
            <div class="min-w-0">
              <div class="text-[11px] text-ink-faint mb-1">合同金额</div>
              <div class="text-[13px] text-ink truncate editable" data-edit="contract.amount" data-evalue="${p.contract ? p.contract.amount : ''}">${p.contract ? fmtMoney(p.contract.amount) : '未填'}<span class="pencil-hint">${icon('edit', 11)}</span></div>
            </div>
            <div class="min-w-0">
              <div class="text-[11px] text-ink-faint mb-1">签订日期</div>
              <div class="text-[13px] text-ink truncate editable" data-edit="contract.signDate" data-evalue="${p.contract ? p.contract.signDate : ''}">${fmtDate(p.contract ? p.contract.signDate : '')}<span class="pencil-hint">${icon('edit', 11)}</span></div>
            </div>
            <div class="md:col-span-4">
              <div class="flex items-center justify-between">
                <div class="text-[11px] text-ink-faint mb-1">合同附件</div>
                <div class="flex items-center gap-2">
                  <button class="btn py-1 px-2.5" data-ct-upload>${icon('upload', 12)} 添加附件</button>
                </div>
              </div>
              ${(p.contract?.files || []).map((f) => `<div class="flex items-center justify-between gap-2 group">
                <span class="text-[12px] text-ink truncate shrink-0" title="点击预览">
                  <button class="flex items-center gap-1 group/att hover:text-brand-deep transition-colors" data-ct-preview data-ct-pv="${esc(f.name || '')}" title="预览 / 下载">${icon('file', 12)} <span class="truncate max-w-[180px]">${f.name || '附件'}</span></button>
                </span>
                <span class="flex items-center gap-1.5 shrink-0">
                  ${f.data ? `<a class="text-brand-deep hover:opacity-80" title="下载" data-ct-dl="${esc(f.name || '')}">${icon('download', 13)}</a>` : ''}
                  <button class="text-ink-faint hover:text-danger text-[12px]" data-del-file="${esc(f.name || '')}">${icon('trash', 13)}</button>
                </span>
              </div>`).join('')}
            </div>
          </div>
          ${p.remark ? `<div class="border-t border-hair px-4 py-3"><span class="text-[11px] text-ink-faint">备注</span><div class="text-[13px] text-ink mt-0.5 editable" data-edit="remark" data-evalue="${esc(p.remark)}">${esc(p.remark)}<span class="pencil-hint">${icon('edit', 11)}</span></div></div>` : ''}
        </div>

        <div class="card overflow-hidden">
          <div class="px-4 py-3 border-b border-hair flex items-center justify-between">
            <span class="text-[14px] font-semibold text-ink flex items-center gap-2">${icon('check', 15)} 当前阶段任务 <span class="text-[11px] font-normal text-ink-faint"></span></span>
            <div class="flex items-center gap-2">
              <button class="btn py-1 px-2.5" data-task-add>${icon('plus', 13)} 添加任务</button>
              <a href="#/gantt/${p.id}/${activeStage ? activeStage.key : 'dev'}" class="text-[12px] text-brand-deep hover:underline">详细甘特 ${icon('chevron', 13)}</a>
            </div>
          </div>
          <table class="w-full"><thead class="bg-canvas/50"><tr>
            <th class="table-th">任务</th><th class="table-th">负责人</th><th class="table-th">状态</th><th class="table-th">进度</th><th class="table-th text-right">计划开始</th>
          </tr></thead><tbody>
            ${(taskRows + moreRow) || `<tr><td colspan="5" class="table-td text-center text-ink-faint">当前阶段暂无任务，点击右上「添加任务」</td></tr>`}
          </tbody></table>
        </div>

        <div id="stagePanel" class="fixed top-0 right-0 bottom-0 w-[340px] max-w-[86vw] bg-white shadow-2xl border-l border-line z-40 transition-transform duration-200 translate-x-full"></div>
      </div>

      <div class="space-y-4">
        <div class="card overflow-hidden">
          <div class="px-4 py-3 border-b border-hair text-[14px] font-semibold text-ink flex items-center gap-2">${icon('edit', 15)} 项目日志 <span class="ml-auto flex items-center gap-1 text-[11px] font-normal text-ink-faint">${icon('refresh', 12)} 自动记录 · 共 ${projectLogs.length} 条</span></div>
          <div class="divide-y divide-hair bg-white">${logRows}</div>
          ${logMoreRow}
        </div>
      </div>
      </div>
    </div>
  </div>
  ${isOn('hours') ? '<div id="hoursHost" class="mt-4"></div>' : ''}
  ${teamModal()}
`;

  root.querySelector('[data-back]')?.addEventListener('click', () => {
    window.location.hash = '#/projects';
  });
  const ctUpload = root.querySelector('[data-ct-upload]');
  if (ctUpload) {
    const ctFile = document.createElement('input');
    ctFile.type = 'file';
    ctFile.accept = '.doc,.docx,.pdf,.xls,.xlsx,.zip';
    ctFile.multiple = true;
    ctFile.style.display = 'none';
    root.appendChild(ctFile);
    ctUpload.addEventListener('click', () => ctFile.click());
    ctFile.addEventListener('change', () => {
      const list = Array.from(ctFile.files || []);
      if (!list.length) return;
      let remaining = list.length;
      const added: { name: string; size: number; uploadedAt: string; data: string }[] = [];
      list.forEach((f) => {
        const reader = new FileReader();
        reader.onload = () => {
          added.push({
            name: f.name,
            size: f.size,
            uploadedAt: new Date().toISOString().slice(0, 10),
            data: String(reader.result || ''),
          });
          remaining -= 1;
          if (remaining === 0) {
            const files = (p.contract?.files || []).concat(added);
            updateProject(p.id, { contract: { no: p.contract?.no ?? '', name: p.contract?.name ?? '', amount: p.contract?.amount ?? '', signDate: p.contract?.signDate ?? '', payment: p.contract?.payment, files } });
            toast(`已上传 ${list.length} 个附件`);
            ctFile.value = '';
          }
        };
        reader.readAsDataURL(f);
      });
    });
  }
  root.querySelectorAll('[data-del-file]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.delFile ?? '';
      confirmPopover(btn as HTMLElement, {
        title: `确定删除文件 ${name || '此附件'} 吗？此操作不可恢复。`,
        onConfirm: () => {
          const files = (p.contract?.files || []).filter((f) => f.name !== name);
          updateProject(p.id, { contract: { no: p.contract?.no ?? '', name: p.contract?.name ?? '', amount: p.contract?.amount ?? '', signDate: p.contract?.signDate ?? '', payment: p.contract?.payment, files } });
          toast(`已删除附件 ${name}`);
        },
      });
    });
  });
  root.querySelectorAll('[data-ct-preview]').forEach((el) => {
    (el as HTMLElement).addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const name = (el as HTMLElement).getAttribute('data-ct-pv') ?? '';
      const f = (p.contract?.files || []).find((x) => x.name === name);
      if (!f) { toast('附件不存在或已被移除', 'warn'); return; }
      const dot = f.name.lastIndexOf('.');
      const base = dot > 0 ? f.name.slice(0, dot) : f.name;
      const ext = dot > 0 ? f.name.slice(dot + 1).toLowerCase() : 'bin';
      openPreview({
        name: f.name,
        ext,
        data: f.data,
        size: f.data ? dataUrlSize(f.data) : undefined,
        onDownload: () => downloadDataUrl(f.name, f.data),
      });
    });
  });
  root.querySelectorAll('[data-ct-dl]').forEach((el) => {
    (el as HTMLElement).addEventListener('click', (ev) => {
      ev.preventDefault();
      const name = (el as HTMLElement).getAttribute('data-ct-dl') ?? '';
      const f = (p.contract?.files || []).find((x) => x.name === name);
      if (f?.data) {
        const a = document.createElement('a');
        a.href = f.data;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(`已下载 ${f.name}`, 'success');
      } else {
        toast('该附件未保存实际内容，暂无法下载', 'warn');
      }
    });
  });
  root.querySelector('[data-prj-del]')?.addEventListener('click', () => {
    if (window.confirm(`确认删除项目「${p.name}」？该操作不可撤销。`)) {
      removeProject(p.id);
      toast('项目已删除');
      navigate('#/projects');
    }
  });
  root.querySelector('[data-prj-gen]')?.addEventListener('click', () => {
    openGenModal(undefined, p.id);
  });

  const hs = root.querySelector<HTMLElement>('#hoursHost');
  if (hs) mountHours(hs, p.id);
  const nt = root.querySelector<HTMLSelectElement>('[data-prj-notify]');
  if (nt) {
    nt.addEventListener('change', () => {
      const t = nt.value as NotifyType;
      if (!t) return;
      const proj = getProject(p.id);
      if (!proj) return;
      const doc = genNotifyDoc(proj, t);
      toast(`已生成「${t}」并存入模板中心`);
      nt.value = '';
      openGenModal(doc, proj.id);
    });
  }

  // ---- 阶段 / 任务：纯行内编辑 ----
  const cur = (): Project | undefined => getProject(p.id);
  const refresh = (): void => renderProjectDetail(root, p.id);

  // 阶段状态：点击在 未开始→进行中→已完成 间循环
  root.querySelectorAll<HTMLElement>('[data-stage-status]').forEach(el => {
    el.addEventListener('click', (ev: MouseEvent) => {
      ev.stopPropagation();
      const key = el.dataset.stageStatus as PhaseKey;
      const proj = cur();
      const st = proj?.stages.find(s => s.key === key);
      if (!proj || !st) return;
      const order: StageStatus[] = ['pending', 'active', 'done'];
      const next = order[(order.indexOf(st.status) + 1) % order.length];
      updateStage(proj.id, key, { status: next });
      toast(`「${PHASE_META[key].name}」状态已切换为：${STAGE_STATUS[next]}`);
      if (next === 'done' && isOn('notify')) autoNotifyOnStage(getProject(proj.id)!);
    });
  });

  // 阶段计划起止：change 即保存
  const bindStageDate = (attr: 'start' | 'end') => {
    root.querySelectorAll<HTMLInputElement>(`[data-stage-${attr}]`).forEach(inp => {
      inp.addEventListener('change', () => {
        const key = inp.dataset[attr === 'start' ? 'stageStart' : 'stageEnd'] as PhaseKey;
        const proj = cur();
        if (!proj) return;
        const patch = attr === 'start' ? { planStart: inp.value } : { planEnd: inp.value };
        updateStage(proj.id, key, patch);
        toast(`${PHASE_META[key].name} 计划${attr === 'start' ? '开始' : '结束'}已保存`);
      });
    });
  };
  bindStageDate('start');
  bindStageDate('end');

  // 阶段时间轴：点击节点 → 右侧滑出阶段任务面板；点击空白/关闭按钮收起
  const getStagePanel = (): HTMLElement | null => root.querySelector<HTMLElement>('#stagePanel');
  const closeStagePanel = (): void => {
    const pt = getStagePanel();
    if (!pt) return;
    pt.classList.add('translate-x-full');
    pt.classList.remove('translate-x-0');
  };
  const openStagePanel = (key: PhaseKey): void => {
    const pt = getStagePanel();
    if (!pt) return;
    const proj = getProject(p.id);
    const st = proj?.stages.find(s => s.key === key);
    const tasks = proj ? proj.tasks.filter(t => t.phase === key) : [];
    const col = st ? (st.status === 'pending' ? '#C5CEDA' : st.status === 'done' ? '#70AD47' : '#5B9BD5') : '#5B9BD5';
    const rows = tasks.length
      ? tasks
          .map(
            t => `<div class="flex items-center justify-between gap-2 py-2.5 border-b border-hair">
            <div class="min-w-0">
              <div class="text-[13px] text-ink truncate">${esc(t.name)}</div>
              <div class="text-[11px] text-ink-faint mt-0.5 truncate">${ownerChips(t.owner)}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              ${taskStatusBadge(t.status)}
              <span class="text-[12px] text-ink-soft min-w-[34px] text-right">${t.progress}%</span>
            </div>
          </div>`
          )
          .join('')
      : `<div class="py-10 text-center text-ink-faint text-[12px]">该阶段暂无任务</div>`;
    pt.innerHTML = `<div class="flex items-center justify-between px-4 h-12 border-b border-hair">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${col}"></span>
          <span class="text-[14px] font-bold text-ink truncate">${PHASE_META[key].name}</span>
          <span class="text-[11px] text-ink-faint shrink-0">计划 ${st ? fmtDate(st.planStart) : ''} ~ ${st ? fmtDate(st.planEnd) : ''}</span>
        </div>
        <button data-panel-close class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-canvas text-ink-faint shrink-0">${icon('x', 15)}</button>
      </div>
      <div class="px-4" data-panel-body>${rows}</div>`;
    pt.classList.remove('translate-x-full');
    pt.classList.add('translate-x-0');
  };

  root.querySelectorAll<HTMLElement>('[data-stage-node]').forEach(node => {
    node.addEventListener('click', (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest('input, [data-stage-status]')) return;
      openStagePanel(node.dataset.stageNode as PhaseKey);
    });
  });

  root.addEventListener('click', (ev: MouseEvent) => {
    if ((ev.target as HTMLElement).closest('[data-panel-close]')) closeStagePanel();
  });
  document.addEventListener('click', (ev: MouseEvent) => {
    const t = ev.target as HTMLElement;
    if (getStagePanel()?.classList.contains('translate-x-full')) return;
    if (!t.closest('#stagePanel') && !t.closest('[data-stage-node],[data-stage-status],input')) closeStagePanel();
  });

  // 初始定位：默认滚动到当前阶段并展开其详情面板
  if (activeStage) {
    const scrollEl = root.querySelector<HTMLElement>('#stageScroll');
    const node = root.querySelector<HTMLElement>(`[data-stage-node="${activeStage.key}"]`);
    if (scrollEl && node) {
      scrollEl.scrollLeft = Math.max(0, node.offsetLeft - scrollEl.clientWidth / 2 + node.offsetWidth / 2);
    }
    openStagePanel(activeStage.key);
  }

  // 时间轴左右箭头：滚动
  const tsScroll = root.querySelector<HTMLElement>('#stageScroll');
  root.querySelectorAll<HTMLElement>('.ts-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!tsScroll) return;
      tsScroll.scrollBy({ left: (Number(btn.getAttribute('data-ts')) || 0) * Math.max(220, tsScroll.clientWidth * 0.6), behavior: 'smooth' });
    });
  });

  // 当前阶段任务：显示全部 / 收起
  root.querySelector<HTMLElement>('[data-stage-more]')?.addEventListener('click', () => {
    stageTaskLimit = stageTaskLimit === 8 ? allStageTasks.length : 8;
    refresh();
  });

  // 项目日志：展开全部 / 收起
  root.querySelector<HTMLElement>('[data-log-more]')?.addEventListener('click', () => {
    stageLogExpanded = !stageLogExpanded;
    refresh();
  });

  // 任务单元格：点击进入编辑（文本 / 下拉状态 / 数字进度）
  root.querySelectorAll<HTMLElement>('[data-task-field]').forEach(cell => {
    cell.addEventListener('click', (ev: MouseEvent) => {
      ev.stopPropagation();
      if (cell.querySelector('input,select')) return;
      const tid = cell.dataset.tid as string;
      const field = cell.dataset.taskField as 'name' | 'owner' | 'status' | 'progress';
      const proj = cur();
      const task = proj?.tasks.find(t => t.id === tid);
      if (!proj || !task) return;
      if (field === 'owner') {
        openOwnerModal(root, task.owner, value => {
          const before = task.owner;
          updateProject(proj.id, { tasks: proj.tasks.map(item => item.id === tid ? { ...item, owner: value } : item) });
          if (before !== value) addLog({ action: 'update', target: 'task', projectId: proj.id, detail: `负责人变更：「${task.name}」由「${before || '未分配'}」改为「${value || '未分配'}」` });
          toast('任务已保存');
        });
        return;
      }

      const finish = (commit: boolean, value?: string) => {
        if (commit && value !== undefined) {
          const tasks = proj.tasks.map(t => {
            if (t.id !== tid) return t;
            if (field === 'status') return { ...t, status: value as TaskStatus };
            if (field === 'progress') return { ...t, progress: Math.max(0, Math.min(100, Number(value) || 0)) };
            return { ...t, [field]: value } as ProjectTask;
          });
          updateProject(proj.id, { tasks });
          const before = proj.tasks.find(t => t.id === tid);
          if (field === 'status' && value && before && value !== before.status) {
            const st = TASK_STATUS[value as TaskStatus] ?? value;
            const verb = st === '完成' ? '完成任务' : st === '进行中' ? '任务开始' : '更新任务';
            addLog({ action: 'status', target: 'task', projectId: proj.id, detail: `状态变更：「${task.name}」${verb}（${TASK_STATUS[before.status]}→${st}）` });
          } else if (field === 'progress' && value !== undefined && before && Number(value) !== before.progress) {
            addLog({ action: 'update', target: 'task', projectId: proj.id, detail: `进度修改：「${task.name}」进度 ${before.progress}%→${Math.max(0, Math.min(100, Number(value) || 0))}%` });
          } else if (field === 'name' && value !== undefined && value.trim() !== before?.name) {
            addLog({ action: 'update', target: 'task', projectId: proj.id, detail: `任务重命名：「${before?.name}」→「${value.trim()}」` });
          }
          toast('任务已保存');
        } else {
          refresh();
        }
      };

      if (field === 'status') {
        const sel = document.createElement('select');
        sel.className = 'inline-control';
        sel.innerHTML = (Object.keys(TASK_STATUS) as TaskStatus[])
          .map(s => `<option value="${s}" ${s === task.status ? 'selected' : ''}>${TASK_STATUS[s]}</option>`).join('');
        cell.replaceChildren(sel);
        sel.focus();
        sel.addEventListener('change', () => finish(true, sel.value));
        sel.addEventListener('blur', () => finish(true, sel.value));
        sel.addEventListener('keydown', (evK: KeyboardEvent) => {
          if (evK.key === 'Escape') finish(false);
          if (evK.key === 'Enter') finish(true, sel.value);
        });
      } else if (field === 'progress') {
        const num = document.createElement('input');
        num.type = 'number';
        num.min = '0';
        num.max = '100';
        num.value = String(task.progress);
        num.className = 'inline-control w-14';
        cell.replaceChildren(num);
        num.focus();
        const saveNum = () => finish(true, num.value);
        num.addEventListener('blur', saveNum);
        num.addEventListener('keydown', (evK: KeyboardEvent) => {
          if (evK.key === 'Escape') finish(false);
          if (evK.key === 'Enter') saveNum();
        });
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = field === 'name' ? task.name : task.owner;
        inp.placeholder = field === 'name' ? '任务名称' : '负责人';
        inp.className = 'inline-control';
        cell.replaceChildren(inp);
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
        const saveText = () => {
          const v = inp.value.trim();
          if (field === 'name' && !v) { finish(false); return; }
          finish(true, v);
        };
        inp.addEventListener('blur', saveText);
        inp.addEventListener('keydown', (evK: KeyboardEvent) => {
          if (evK.key === 'Escape') finish(false);
          if (evK.key === 'Enter') saveText();
        });
      }
    });
  });

  // 任务计划开始日期
  root.querySelectorAll<HTMLInputElement>('[data-task-start]').forEach(inp => {
    inp.addEventListener('change', () => {
      const tid = inp.dataset.taskStart as string;
      const proj = cur();
      if (!proj) return;
      const tasks = proj.tasks.map(t => (t.id === tid ? { ...t, start: inp.value } : t));
      const prev = proj.tasks.find(t => t.id === tid);
      updateProject(proj.id, { tasks });
      if (prev && prev.start !== inp.value) {
        addLog({ action: 'update', target: 'task', projectId: proj.id, detail: `计划开始变更：「${prev.name}」 ${prev.start || '未填'}→${inp.value || '未填'}` });
      }
      toast('任务计划开始已保存');
    });
  });

  // 删除任务
  root.querySelectorAll<HTMLElement>('[data-task-del]').forEach(btn => {
    btn.addEventListener('click', (ev: MouseEvent) => {
      ev.stopPropagation();
      const tid = btn.dataset.taskDel as string;
      const proj = cur();
      if (!proj) return;
      const task = proj.tasks.find(t => t.id === tid);
      confirmPopover(btn, {
        title: `确认删除任务「${esc(task?.name || '')}」？删除后不可恢复。`,
        onConfirm: () => {
          updateProject(proj.id, { tasks: proj.tasks.filter(t => t.id !== tid) });
          addLog({ action: 'delete', target: 'task', projectId: proj.id, detail: `删除任务「${task?.name || ''}」` });
          toast('任务已删除');
        },
      });
    });
  });

  // 添加任务：弹出填写表单（名称/负责人/状态/进度/计划开始/计划交付）
  root.querySelector('[data-task-add]')?.addEventListener('click', () => {
    const proj = cur();
    if (!proj) return;
    const ai = activeStageIndex(proj);
    openTaskModal(root, {
      title: '添加任务',
      phaseHint: `将添加到当前阶段（${STAGE_STATUS[proj.stages[ai]?.status || 'pending']}）`,
      defaults: {
        name: '', owner: '', status: 'todo', progress: 0, milestone: false,
        start: proj.stages[ai]?.planStart ?? '', end: proj.stages[ai]?.planEnd ?? '',
      },
      onSave: (f) => {
        const newTask: ProjectTask = {
          id: `task_${Date.now()}`, name: f.name, phase: proj.stages[ai]?.key ?? 'dev',
          owner: f.owner, start: f.start, end: f.end, status: f.status, progress: f.progress,
          milestone: f.milestone,
        };
        updateProject(proj.id, { tasks: [...proj.tasks, newTask] });
        addLog({ action: 'create', target: 'task', projectId: proj.id, detail: `新增「${proj.name}」任务「${f.name}」` });
        toast(`已添加任务「${f.name}」`);
      },
    });
  });

  // ===== 产品详情：设备 / 系统 / 集成 三类独立维护 =====
  root.querySelector('[data-product-add]')?.addEventListener('click', () => {
    const proj = cur();
    if (!proj) return;
    openProductModal(root, {
      title: '添加设备',
      defaults: { name: '', spec: '', qty: '' },
      onSave: f => {
        const item = { id: `prod_${Date.now()}`, ...f };
        updateProject(proj.id, { products: [...(proj.products ?? []), item] });
        addLog({ action: 'create', target: 'product', projectId: proj.id, detail: `「${proj.name}」新增设备「${f.name}」` });
        toast(`已添加设备「${f.name}」`);
      },
    });
  });
  root.querySelectorAll<HTMLElement>('[data-product-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proj = cur();
      if (!proj) return;
      const item = (proj.products ?? []).find(x => x.id === btn.dataset.productEdit);
      if (!item) return;
      openProductModal(root, {
        title: '编辑设备',
        defaults: { name: item.name, spec: item.spec, qty: item.qty },
        onSave: f => {
          updateProject(proj.id, { products: (proj.products ?? []).map(x => (x.id === item.id ? { ...x, ...f } : x)) });
          addLog({ action: 'update', target: 'product', projectId: proj.id, detail: `「${proj.name}」修改设备「${item.name}」` });
          toast('设备信息已保存');
        },
      });
    });
  });
  // 添加系统
  root.querySelector('[data-system-add]')?.addEventListener('click', () => {
    const proj = cur();
    if (!proj) return;
    openSystemModal(root, {
      title: '添加对接系统',
      defaults: { name: '', version: '' },
      onSave: f => {
        const item = { id: `sys_${Date.now()}`, ...f };
        updateProject(proj.id, { systems: [...(proj.systems ?? []), item] });
        addLog({ action: 'create', target: 'system', projectId: proj.id, detail: `「${proj.name}」新增对接系统「${f.name} ${f.version}」` });
        toast(`已添加系统「${f.name}」`);
      },
    });
  });
  // 添加集成
  root.querySelector('[data-integrate-add]')?.addEventListener('click', () => {
    const proj = cur();
    if (!proj) return;
    openIntegrateModal(root, {
      title: '添加集成平台',
      defaults: { name: '', target: '' },
      onSave: forms => {
        const items = forms.map((f, index) => ({ id: `int_${Date.now()}_${index}`, ...f }));
        updateProject(proj.id, { integrates: [...(proj.integrates ?? []), ...items] });
        addLog({ action: 'create', target: 'integrate', projectId: proj.id, detail: `「${proj.name}」新增集成平台「${items.map(item => item.name).join('、')}」` });
        toast(`已添加 ${items.length} 个集成平台`);
      },
    });
  });
  // 删除系统
  root.querySelectorAll<HTMLElement>('[data-system-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proj = cur();
      if (!proj) return;
      const sid = btn.dataset.systemDel || '';
      const s = (proj.systems ?? []).find(x => x.id === sid);
      if (!s) return;
      confirmPopover(btn, {
        title: `确认删除对接系统「${esc(s.name)}」？`,
        onConfirm: () => {
          updateProject(proj.id, { systems: (proj.systems ?? []).filter(x => x.id !== sid) });
          addLog({ action: 'delete', target: 'system', projectId: proj.id, detail: `「${proj.name}」删除对接系统「${s.name}」` });
          toast('系统已删除');
        },
      });
    });
  });
  // 删除集成
  root.querySelectorAll<HTMLElement>('[data-integrate-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proj = cur();
      if (!proj) return;
      const iid = btn.dataset.integrateDel || '';
      const it = (proj.integrates ?? []).find(x => x.id === iid);
      if (!it) return;
      confirmPopover(btn, {
        title: `确认删除集成平台「${esc(it.name)}」？`,
        onConfirm: () => {
          updateProject(proj.id, { integrates: (proj.integrates ?? []).filter(x => x.id !== iid) });
          addLog({ action: 'delete', target: 'integrate', projectId: proj.id, detail: `「${proj.name}」删除集成平台「${it.name}」` });
          toast('集成已删除');
        },
      });
    });
  });
  root.querySelectorAll<HTMLElement>('[data-product-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proj = cur();
      if (!proj) return;
      const item = (proj.products ?? []).find(x => x.id === btn.dataset.productDel);
      if (!item) return;
      confirmPopover(btn, {
        title: `确认删除产品「${esc(item.name)}」？删除后不可恢复。`,
        onConfirm: () => {
          updateProject(proj.id, { products: (proj.products ?? []).filter(x => x.id !== item.id) });
          addLog({ action: 'delete', target: 'product', projectId: proj.id, detail: `「${proj.name}」删除产品「${item.name}」` });
          toast('产品已删除');
        },
      });
    });
  });
  // 行内字段（名称/规格/数量/系统/集成）快速编辑 → 复用弹框
  root.querySelectorAll<HTMLElement>('[data-product-field]').forEach(cell => {
    cell.addEventListener('click', (ev: MouseEvent) => {
      ev.stopPropagation();
      const proj = cur();
      if (!proj) return;
      const pid = cell.dataset.pid || '';
      const item = (proj.products ?? []).find(x => x.id === pid);
      if (!item) return;
      openProductModal(root, {
        title: '编辑产品/设备',
        defaults: { name: item.name, spec: item.spec, qty: item.qty },
        onSave: f => {
          updateProject(proj.id, { products: (proj.products ?? []).map(x => (x.id === pid ? { ...x, ...f } : x)) });
          toast('产品信息已保存');
        },
      });
    });
  });

  // 总体进度为自动计算（由阶段状态推导），无需手动拖拽

  const baseContract = (): NonNullable<Project['contract']> => ({ no: '', name: '', amount: '', signDate: '', payment: '' });
  const editableFields: Record<string, { type: 'text' | 'date' | 'textarea'; set: (v: string) => void }> = {
    name: { type: 'text', set: v => updateProject(p.id, { name: v }) },
    customer: { type: 'text', set: v => updateProject(p.id, { customer: v }) },
    planStart: { type: 'date', set: v => updateProject(p.id, { planStart: v }) },
    planEnd: { type: 'date', set: v => updateProject(p.id, { planEnd: v }) },
    remark: { type: 'textarea', set: v => updateProject(p.id, { remark: v }) },
    'contract.name': { type: 'text', set: v => updateProject(p.id, { contract: { ...(p.contract ?? baseContract()), name: v } }) },
    'contract.no': { type: 'text', set: v => updateProject(p.id, { contract: { ...(p.contract ?? baseContract()), no: v } }) },
    'contract.amount': { type: 'text', set: v => updateProject(p.id, { budget: v, contract: { ...(p.contract ?? baseContract()), amount: v } }) },
    'contract.signDate': { type: 'date', set: v => updateProject(p.id, { contract: { ...(p.contract ?? baseContract()), signDate: v } }) },
  };

  const startInlineEdit = (el: HTMLElement): void => {
    const key = el.dataset.edit || '';
    const cfg = editableFields[key];
    if (!cfg) return;
    let cancelled = false;
    const input = cfg.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (cfg.type === 'textarea') (input as HTMLTextAreaElement).rows = 2;
    if (cfg.type === 'date') (input as HTMLInputElement).type = 'date';
    else if (cfg.type === 'text') (input as HTMLInputElement).type = 'text';
    input.className = 'input' + (cfg.type === 'textarea' ? ' w-full' : '');
    input.value = el.dataset.evalue ?? '';
    if (el.dataset.numeric === '1') {
      (input as HTMLInputElement).inputMode = 'decimal';
      const onlyNum = () => { input.value = input.value.replace(/[^\d]/g, ''); };
      input.addEventListener('input', onlyNum);
    }
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    setDirtyApp(true);
    const commit = () => {
      if (cancelled) return;
      let v = input.value.trim();
      if (el.dataset.numeric === '1') v = v.replace(/[^\d]/g, '');
      cfg.set(v);
      toast('已保存');
      setDirtyApp(false);
    };
    const cancel = () => {
      cancelled = true;
      el.textContent = el.dataset.evalue ?? '';
      setDirtyApp(false);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e: Event) => {
      const ek = e as KeyboardEvent;
      if (ek.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (ek.key === 'Escape') cancel();
      e.stopPropagation();
    });
  };
  root.querySelectorAll<HTMLElement>('[data-edit]').forEach((el) => {
    el.addEventListener('dblclick', () => startInlineEdit(el));
  });

  // ---- 安排我方成员：弹窗选择（支持搜索、按角色分组、可滚动）----
  const teamModalEl = root.querySelector<HTMLElement>('[data-tp-modal]');
  const openTeamModal = (): void => {
    teamModalEl?.classList.remove('hidden');
    root.querySelector<HTMLInputElement>('[data-tp-search]')?.focus();
  };
  const closeTeamModal = (): void => teamModalEl?.classList.add('hidden');
  root.querySelector('[data-team-pick]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openTeamModal();
  });
  root.querySelector('[data-tp-close]')?.addEventListener('click', closeTeamModal);
  root.querySelector('[data-tp-cancel]')?.addEventListener('click', closeTeamModal);
  teamModalEl?.addEventListener('click', (e) => {
    if (e.target === teamModalEl) closeTeamModal();
  });
  root.querySelector<HTMLInputElement>('[data-tp-search]')?.addEventListener('input', (e) => {
    const q = ((e.target as HTMLInputElement).value || '').trim().toLowerCase();
    root.querySelectorAll<HTMLElement>('[data-tp-list] .team-opt').forEach((opt) => {
      const name = opt.dataset.name ?? '';
      opt.style.display = !q || name.includes(q) ? '' : 'none';
    });
  });
  root.querySelector('[data-tp-save]')?.addEventListener('click', () => {
    const teamOf: Project['teamOf'] = { tech: [], sales: [], dev: [] };
    root.querySelectorAll<HTMLInputElement>('input[data-tp-role]').forEach((cb) => {
      if (!cb.checked || cb.closest('[style*="display: none"]')) return;
      const role = cb.dataset.tpRole as OurRole;
      const mid = cb.dataset.tpId ?? '';
      const m = getTeam().find((t) => t.id === mid);
      const bucket = teamOf[role];
      if (m && bucket) bucket.push({ id: m.id, name: m.name, tel: m.tel });
    });
    updateProject(p.id, { teamOf } as Partial<Project>);
    closeTeamModal();
    toast('我方成员已更新');
  });

  // ---- 甲方对接人：增 / 删 / 就地编辑（姓名、电话）----
  const readClients = (): { id: string; name: string; tel: string }[] => {
    const cur = getProject(p.id);
    if (cur?.clients?.length) return cur.clients.map(c => ({ id: c.id, name: c.name, tel: c.tel }));
    return [{ id: `clt-${p.id}-0`, name: cur?.contacts.a.name ?? '待定', tel: cur?.contacts.a.tel ?? '—' }];
  };
  const saveClients = (list: { id: string; name: string; tel: string }[]): void => {
    const clients = list.map(c => ({ id: c.id, name: c.name.trim() || '待定', tel: c.tel.trim() || '—' }));
    updateProject(p.id, {
      clients,
      contacts: { ...p.contacts, a: { ...p.contacts.a, name: clients[0]?.name ?? '待定', tel: clients[0]?.tel ?? '—' } },
    } as Partial<Project>);
  };

  root.querySelectorAll<HTMLElement>('[data-client-field]').forEach((el) => {
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (el.querySelector('input')) return;
      const field = el.dataset.clientField as 'name' | 'tel';
      const cid = el.dataset.cid ?? '';
      const input = document.createElement('input');
      input.className = 'input py-0.5 px-1.5 text-[13px]';
      input.value = el.dataset.evalue ?? '';
      el.textContent = '';
      el.appendChild(input);
      input.focus();
      setDirtyApp(true);
      if (field === 'tel') (input as HTMLInputElement).type = 'tel';
      let cancelled = false;
      const commit = () => {
        if (cancelled) return;
        const val = input.value.trim();
        const list = readClients().map(c => (c.id === cid ? { ...c, [field]: val } : c));
        saveClients(list);
        toast('甲方对接人已更新');
        setDirtyApp(false);
      };
      const cancel = () => {
        cancelled = true;
        el.textContent = el.dataset.evalue ?? '';
        setDirtyApp(false);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ke) => {
        const ek = ke as KeyboardEvent;
        if (ek.key === 'Enter') { ek.preventDefault(); input.blur(); }
        else if (ek.key === 'Escape') cancel();
        ek.stopPropagation();
      });
    });
  });

  root.querySelector('[data-client-add]')?.addEventListener('click', () => {
    const list = readClients();
    list.push({ id: `clt${Date.now()}`, name: '新联系人', tel: '—' });
    saveClients(list);
    toast('已添加甲方联系人');
  });

  root.querySelectorAll<HTMLElement>('[data-client-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.clientDel ?? '';
      const list = readClients().filter(c => c.id !== cid);
      saveClients(list);
      toast('已删除甲方联系人');
    });
  });
}

const STAGE_STATUS: Record<StageStatus, string> = { pending: '未开始', active: '进行中', done: '已完成' };
const TASK_STATUS: Record<TaskStatus, string> = { todo: '未开始', doing: '进行中', done: '已完成' };

/** 项目状态（由总体进度推导）：0 待开始 / 0<x<100 进行中 / 100 已完成 */
function projState(progress: number): { label: string; color: string; bg: string } {
  const p = Math.max(0, Math.min(100, Number(progress) || 0));
  if (p <= 0) return { label: '待开始', color: '#6B7A90', bg: '#EEF2F7' };
  if (p >= 100) return { label: '已完成', color: '#70AD47', bg: '#EAF3E2' };
  return { label: '进行中', color: '#5B9BD5', bg: '#EAF3FB' };
}

/** 自动计算总体进度：按阶段状态加权 —— done 阶段满分、active 阶段按其时间进度计入、pending 不计 */
function autoProgress(p: Project): number {
  const stages = p.stages?.length ? p.stages : [];
  if (!stages.length) return Math.max(0, Math.min(100, Number(p.progress) || 0));
  let total = 0;
  for (const s of stages) {
    if (s.status === 'done') { total += 100; continue; }
    if (s.status !== 'active') continue;
    const s0 = Date.parse(s.planStart + 'T00:00:00');
    const s1 = Date.parse(s.planEnd + 'T00:00:00');
    if (!(Number.isFinite(s0) && Number.isFinite(s1)) || s1 <= s0) { total += 50; continue; }
    const el = (Date.now() - s0) / (s1 - s0);
    total += Math.max(0, Math.min(100, Math.round(el * 100)));
  }
  return Math.min(100, Math.round(total / stages.length));
}

interface TaskForm {
  name: string; owner: string; status: TaskStatus; progress: number; start: string; end: string; milestone: boolean;
}
interface TaskModalOpts {
  title: string; phaseHint: string;
  defaults: TaskForm;
  onSave: (f: TaskForm) => void;
}
function openTaskModal(root: HTMLElement, opts: TaskModalOpts): void {
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="flex items-center justify-between px-4 py-3 border-b border-line">
        <div class="text-[15px] font-semibold text-ink">${opts.title}</div>
        <button class="text-ink-faint hover:text-ink" data-task-modal-close title="关闭">${icon('x', 16)}</button>
      </div>
      <div class="px-4 py-3 space-y-3">
        <div class="text-[11px] text-brand-deep">${opts.phaseHint}</div>
        <label class="block"><span class="text-[12px] text-ink-soft">任务名称 <b class="text-[#C00000]">*</b></span>
          <input id="tm-name" class="input w-full mt-1" value="${esc(opts.defaults.name)}" placeholder="请输入任务名称" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <div><span class="text-[12px] text-ink-soft">负责人（可多选）</span>
            <div id="tm-owner" class="mt-1 border border-line rounded-md p-1 max-h-32 overflow-y-auto">${ownerOptions(opts.defaults.owner)}</div>
          </div>
          <label class="block"><span class="text-[12px] text-ink-soft">状态</span>
            <select id="tm-status" class="input w-full mt-1"></select>
          </label>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="block"><span class="text-[12px] text-ink-soft">进度（%）</span>
            <input id="tm-progress" type="number" min="0" max="100" class="input w-full mt-1" value="${opts.defaults.progress}" />
          </label>
          <label class="block flex items-end gap-2 pb-1"><span class="text-[12px] text-ink-soft"></span>
            <label class="flex items-center gap-1.5 cursor-pointer select-none text-[12px] text-ink">
              <input id="tm-milestone" type="checkbox" class="accent-[#E36C0A]" ${opts.defaults.milestone ? 'checked' : ''} />
              关键任务
            </label>
          </label>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="block"><span class="text-[12px] text-ink-soft">计划开始</span>
            <input id="tm-start" type="date" class="input w-full mt-1" value="${opts.defaults.start}" />
          </label>
          <label class="block"><span class="text-[12px] text-ink-soft">计划交付</span>
            <input id="tm-end" type="date" class="input w-full mt-1" value="${opts.defaults.end}" />
          </label>
        </div>
      </div>
      <div class="flex justify-end gap-2 px-4 py-3 border-t border-line">
        <button class="btn" data-task-modal-cancel>取消</button>
        <button class="btn-primary" data-task-modal-save>保存</button>
      </div>
    </div>`;
  const statusSel = bg.querySelector<HTMLSelectElement>('#tm-status');
  if (statusSel) {
    statusSel.innerHTML = (Object.keys(TASK_STATUS) as TaskStatus[])
      .map(s => `<option value="${s}" ${s === opts.defaults.status ? 'selected' : ''}>${TASK_STATUS[s]}</option>`).join('');
  }
  bg.addEventListener('click', (ev: MouseEvent) => {
    if (ev.target === bg) close();
  });
  bg.querySelector('[data-task-modal-close]')?.addEventListener('click', close);
  bg.querySelector('[data-task-modal-cancel]')?.addEventListener('click', close);
  bg.querySelector('[data-task-modal-save]')?.addEventListener('click', () => {
    const name = (bg.querySelector('#tm-name') as HTMLInputElement).value.trim();
    if (!name) { toast('请填写任务名称', 'warn'); return; }
    const progress = Math.max(0, Math.min(100, Number((bg.querySelector('#tm-progress') as HTMLInputElement).value) || 0));
    opts.onSave({
      name,
      owner: Array.from(bg.querySelectorAll<HTMLInputElement>('#tm-owner input[type="checkbox"]:checked')).map(input => input.value).join(', '),
      status: (bg.querySelector('#tm-status') as HTMLSelectElement).value as TaskStatus,
      progress,
      start: (bg.querySelector('#tm-start') as HTMLInputElement).value,
      end: (bg.querySelector('#tm-end') as HTMLInputElement).value,
      milestone: (bg.querySelector('#tm-milestone') as HTMLInputElement).checked,
    });
    close();
  });
  root.appendChild(bg);
  function close(): void { bg.remove(); }
  setTimeout(() => (bg.querySelector('#tm-name') as HTMLInputElement)?.focus(), 0);
}

// ===== 产品详情：新增/编辑弹框 =====
// ===== 产品详情：新增/编辑弹框（设备 / 对接系统 / 集成平台） =====
interface ProductForm {
  name: string;
  spec: string;
  qty: string;
}
interface SystemForm {
  name: string;
  version: string;
}
interface IntegrateForm {
  name: string;
  target: string;
}

// 常用产品目录等参数在「资源明细」页维护，见 src/data/resourceConfig.ts

/** 设备弹框：仅设备名（从 catalog 选）+ 规格 + 数量 */
export function openProductModal(root: HTMLElement, opts: {
  title: string;
  defaults: ProductForm;
  onSave: (f: ProductForm) => void;
}): void {
  const d = opts.defaults;
  const catalog = getProductCatalog();
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="px-4 py-3 border-b border-line flex items-center justify-between">
        <span class="text-[15px] font-semibold text-ink">${icon('box', 16)} ${opts.title}</span>
        <button type="button" class="text-ink-faint hover:text-ink" data-pm-close>${icon('x', 18)}</button>
      </div>
      <div class="p-4 space-y-3">
        <label class="block"><span class="text-[12px] text-ink-soft">产品/设备名称 <span class="text-[#E36C0A]">*</span></span>
          <select id="pm-name" class="input w-full mt-1">
            <option value="">— 请选择设备 —</option>
            ${catalog.map((p) => `<option value="${esc(p.name)}" ${d.name === p.name ? 'selected' : ''}>${esc(p.name)}${p.spec ? '（' + esc(p.spec) + '）' : ''}</option>`).join('')}
            <option value="__custom__" ${d.name && !catalog.some((p) => p.name === d.name) ? 'selected' : ''}>＋ 自定义…</option>
          </select>
        </label>
        <label id="pm-custom-wrap" class="block ${d.name && !catalog.some((p) => p.name === d.name) ? '' : 'hidden'}"><span class="text-[12px] text-ink-soft">自定义名称</span>
          <input id="pm-custom" class="input w-full mt-1" placeholder="输入产品/设备名称" value="${d.name && !catalog.some((p) => p.name === d.name) ? esc(d.name) : ''}" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block"><span class="text-[12px] text-ink-soft">规格 / 型号</span>
            <input id="pm-spec" class="input w-full mt-1" placeholder="如：标准款 / A型" value="${esc(d.spec)}" />
          </label>
          <label class="block"><span class="text-[12px] text-ink-soft">数量 <span class="text-[#E36C0A]">*</span></span>
            <input id="pm-qty" class="input w-full mt-1" placeholder="如：3 台" value="${esc(d.qty)}" />
          </label>
        </div>
      </div>
      <div class="flex justify-end gap-2 px-4 py-3 border-t border-line">
        <button class="btn" data-pm-cancel>取消</button>
        <button class="btn-primary" data-pm-save>保存</button>
      </div>
    </div>`;
  const close = (): void => bg.remove();
  bg.addEventListener('click', (ev: MouseEvent) => { if (ev.target === bg) close(); });
  bg.querySelector('[data-pm-close]')?.addEventListener('click', close);
  bg.querySelector('[data-pm-cancel]')?.addEventListener('click', close);
  const $name = bg.querySelector('#pm-name') as HTMLSelectElement;
  const $custom = bg.querySelector('#pm-custom') as HTMLInputElement;
  const $customWrap = bg.querySelector('#pm-custom-wrap') as HTMLElement;
  const $spec = bg.querySelector('#pm-spec') as HTMLInputElement;
  const $qty = bg.querySelector('#pm-qty') as HTMLInputElement;
  $name.addEventListener('change', () => {
    $customWrap.classList.toggle('hidden', $name.value !== '__custom__');
    if (!$spec.value) {
      const hit = catalog.find((p) => p.name === $name.value);
      if (hit && hit.spec) $spec.value = hit.spec;
    }
  });
  bg.querySelector('[data-pm-save]')?.addEventListener('click', () => {
    const picked = $name.value;
    const name = picked === '__custom__' ? $custom.value.trim() : picked.trim();
    if (!name) { toast(picked === '__custom__' ? '请输入自定义设备名称' : '请选择产品/设备', 'warn'); return; }
    opts.onSave({ name, spec: $spec.value.trim(), qty: $qty.value.trim() });
    close();
  });
  root.appendChild(bg);
  setTimeout(() => {
    if (d.name) { $qty.focus(); } else { $name.focus(); }
  }, 0);
}

/** 对接系统弹框：系统名称 + 版本号（从资源目录选版本） */
export function openSystemModal(root: HTMLElement, opts: {
  title: string;
  defaults: SystemForm;
  onSave: (f: SystemForm) => void;
}): void {
  const d = opts.defaults;
  const sysOpts = getProductSystems();
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="px-4 py-3 border-b border-line flex items-center justify-between">
        <span class="text-[15px] font-semibold text-ink">${icon('layers', 16)} ${opts.title}</span>
        <button type="button" class="text-ink-faint hover:text-ink" data-sm-close>${icon('x', 18)}</button>
      </div>
      <div class="p-4 space-y-3">
        <label class="block"><span class="text-[12px] text-ink-soft">对接系统名称 <span class="text-[#E36C0A]">*</span></span>
          <input id="sm-name" class="input w-full mt-1" placeholder="如：印章管控平台" value="${esc(d.name)}" />
        </label>
        <label class="block"><span class="text-[12px] text-ink-soft">版本号 <span class="text-[#E36C0A]">*</span></span>
          <select id="sm-version" class="input w-full mt-1">
            <option value="">— 选择版本 —</option>
            ${sysOpts.map((v) => `<option value="${esc(v)}" ${d.version === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="flex justify-end gap-2 px-4 py-3 border-t border-line">
        <button class="btn" data-sm-cancel>取消</button>
        <button class="btn-primary" data-sm-save>保存</button>
      </div>
    </div>`;
  const close = (): void => bg.remove();
  bg.addEventListener('click', (ev: MouseEvent) => { if (ev.target === bg) close(); });
  bg.querySelector('[data-sm-close]')?.addEventListener('click', close);
  bg.querySelector('[data-sm-cancel]')?.addEventListener('click', close);
  const $name = bg.querySelector('#sm-name') as HTMLInputElement;
  const $ver = bg.querySelector('#sm-version') as HTMLSelectElement;
  bg.querySelector('[data-sm-save]')?.addEventListener('click', () => {
    const name = $name.value.trim();
    const version = $ver.value;
    if (!name || !version) { toast('请填写系统名称并选择版本号', 'warn'); return; }
    opts.onSave({ name, version });
    close();
  });
  root.appendChild(bg);
  setTimeout(() => $name.focus(), 0);
}

/** 集成平台弹框：集成名称 + 目标平台（从资源目录选） */
export function openIntegrateModal(root: HTMLElement, opts: {
  title: string;
  defaults: IntegrateForm;
  onSave: (forms: IntegrateForm[]) => void;
}): void {
  const d = opts.defaults;
  const intOpts = getProductIntegrates();
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="px-4 py-3 border-b border-line flex items-center justify-between">
        <span class="text-[15px] font-semibold text-ink">${icon('share', 16)} ${opts.title}</span>
        <button type="button" class="text-ink-faint hover:text-ink" data-im-close>${icon('x', 18)}</button>
      </div>
      <div class="p-4 space-y-3">
        <div><span class="text-[12px] text-ink-soft">选择集成系统（可多选） <span class="text-[#E36C0A]">*</span></span>
          <div class="mt-1 border border-line rounded-md p-1 max-h-56 overflow-y-auto">
            ${intOpts.map(s => `<label class="flex items-center gap-2 px-2 py-2 rounded hover:bg-canvas cursor-pointer">
              <input type="checkbox" data-integrate-option value="${esc(s)}" ${d.name.split(',').map(x => x.trim()).includes(s) ? 'checked' : ''}>
              <span class="w-2.5 h-2.5 rounded-full bg-[#70AD47]"></span><span class="text-[13px]">${esc(s)}</span>
            </label>`).join('') || '<span class="text-ink-faint text-[12px]">请先在资源明细维护集成系统</span>'}
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 px-4 py-3 border-t border-line">
        <button class="btn" data-im-cancel>取消</button>
        <button class="btn-primary" data-im-save>保存</button>
      </div>
    </div>`;
  const close = (): void => bg.remove();
  bg.addEventListener('click', (ev: MouseEvent) => { if (ev.target === bg) close(); });
  bg.querySelector('[data-im-close]')?.addEventListener('click', close);
  bg.querySelector('[data-im-cancel]')?.addEventListener('click', close);
  bg.querySelector('[data-im-save]')?.addEventListener('click', () => {
    const names = Array.from(bg.querySelectorAll<HTMLInputElement>('[data-integrate-option]:checked')).map(input => input.value);
    if (!names.length) { toast('请至少选择一个集成系统', 'warn'); return; }
    opts.onSave(names.map(name => ({ name, target: '' })));
    close();
  });
  root.appendChild(bg);
  setTimeout(() => bg.querySelector<HTMLInputElement>('[data-integrate-option]')?.focus(), 0);
}


// 靠近触发元素的内联确认浮层（替代浏览器原生 confirm）
function confirmPopover(anchor: HTMLElement, opts: { title: string; confirmText?: string; onConfirm: () => void }): void {
  document.querySelectorAll<HTMLElement>('[data-confirm-pop]').forEach(el => el.remove());
  const pop = document.createElement('div');
  pop.setAttribute('data-confirm-pop', '');
  pop.className = 'fixed z-[70] w-60 rounded-lg bg-white border border-hair shadow-[0_12px_32px_rgba(43,58,74,0.18)] p-3 text-[13px]';
  pop.innerHTML = `
    <div class="flex items-start gap-2 text-ink">
      <span class="mt-0.5 text-[#E36C0A]">${icon('alert', 15)}</span>
      <div class="flex-1 leading-snug">${opts.title}</div>
    </div>
    <div class="flex justify-end gap-2 mt-3">
      <button class="btn py-1 px-3 text-[12px]" data-pop-cancel>取消</button>
      <button class="py-1 px-3 text-[12px] rounded-md text-white bg-[#C00000] hover:bg-[#A80000] transition-colors" data-pop-ok>${opts.confirmText || '确认删除'}</button>
    </div>`;
  document.body.appendChild(pop);

  // 定位：优先显示在锚点左上方（删除按钮在表格右侧），溢出视口则翻转
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.right - pw;
  let top = r.top - ph - 8;
  if (top < 8) top = r.bottom + 8;
  if (left < 8) left = 8;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  const remove = (): void => { pop.remove(); document.removeEventListener('mousedown', onDoc, true); document.removeEventListener('keydown', onKey, true); };
  pop.querySelector('[data-pop-ok]')?.addEventListener('click', () => { remove(); opts.onConfirm(); });
  pop.querySelector('[data-pop-cancel]')?.addEventListener('click', remove);
  const onDoc = (ev: MouseEvent): void => { if (!pop.contains(ev.target as Node)) remove(); };
  const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') { ev.stopPropagation(); remove(); } };
  setTimeout(() => { document.addEventListener('mousedown', onDoc, true); document.addEventListener('keydown', onKey, true); }, 0);
}
