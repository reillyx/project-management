// 资源明细：团队成员库 + 产品/系统参数维护（后续各模块从这里取用）
import { addTeamMember, getProjects, getTeam, removeTeamMember, updateTeamMember } from '../store';
import { ROLE_META, type TeamMember } from '../data/types';
import {
  getResourceConfig,
  saveResourceConfig,
  type CatalogProduct,
} from '../data/resourceConfig';
import { esc, icon, toast } from '../ui';

let memberRole: 'all' | 'tech' | 'sales' | 'dev' | 'pm' = 'all';
let memberPage = 1;
const MEMBER_PAGE_SIZE = 10;
const roleColor = (role: typeof memberRole): string => role === 'all' ? '#5B9BD5' : ROLE_META[role].color;
const NAME_PINYIN: Record<string, string> = {
  李源: 'liyuan',
  郑云飞: 'zhengyunfei',
  汪洋: 'wangyang',
  陈婷: 'chenting',
  张启凡: 'zhangqifan',
  王芳: 'wangfang',
};
function defaultMemberEmail(name: string): string {
  return `${NAME_PINYIN[name] || name.replace(/\s+/g, '').toLowerCase()}@qyunxi.com`;
}

export function renderTeam(root: HTMLElement): void {
  const roleMembers = memberRole === 'all'
    ? getTeam()
    : getTeam().filter(m => m.roles.includes(memberRole as 'tech' | 'sales' | 'dev' | 'pm'));
  const pageCount = Math.max(1, Math.ceil(roleMembers.length / MEMBER_PAGE_SIZE));
  memberPage = Math.min(memberPage, pageCount);
  const members = roleMembers.slice((memberPage - 1) * MEMBER_PAGE_SIZE, memberPage * MEMBER_PAGE_SIZE);
  const projects = getProjects();

  const memberCard = (m: TeamMember): string => {
    const roleChips = m.roles
      .map(r =>
        ROLE_META[r]
          ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap" style="background:${ROLE_META[r].color}">${ROLE_META[r].label}</span>`
          : '',
      )
      .join('');
    const used = projects.filter(
      p => p.manager === m.name || p.contacts.b.name === m.name,
    ).length;
    return `
    <tr class="hover:bg-canvas/60 transition-colors" data-mid="${m.id}">
      <td class="py-2 px-3 text-[13px] font-medium text-ink whitespace-nowrap">${esc(m.name)}</td>
      <td class="py-2 px-3"><div class="flex gap-1 flex-wrap">${roleChips}</div></td>
      <td class="py-2 px-3 text-[12px] text-ink-soft whitespace-nowrap">${esc(m.tel || '—')}</td>
      <td class="py-2 px-3 text-[12px] text-ink-soft whitespace-nowrap">${esc(m.dept || '—')}</td>
      <td class="py-2 px-3 text-[12px] text-ink-soft whitespace-nowrap">${esc(m.email || '—')}</td>
      <td class="py-2 px-3 text-[12px] text-ink-soft whitespace-nowrap">${used} 个</td>
      <td class="py-2 px-3 text-right whitespace-nowrap">
        <button class="tm-edit btn-ghost px-1.5" data-mid="${m.id}" title="编辑">${icon('edit', 13)}</button>
        <button class="tm-del btn-ghost px-1.5 text-[#C00000]" data-mid="${m.id}" title="删除">${icon('x', 14)}</button>
      </td>
    </tr>`;
  };

  // ---- 产品/系统参数 ----
  const cfg = getResourceConfig();
  const catalogRows = cfg.catalog
    .map(
      (c, i) => `
      <tr class="hover:bg-canvas/60 transition-colors" data-prod-idx="${i}">
        <td class="py-1.5 px-3 text-[13px] font-medium text-ink">${esc(c.name)}</td>
        <td class="py-1.5 px-3 text-[12px] text-ink-soft whitespace-nowrap">${esc(c.spec || '—')}</td>
        <td class="py-1.5 px-3 text-right whitespace-nowrap">
          <button class="prod-edit btn-ghost px-1.5" data-prod-idx="${i}" title="编辑">${icon('edit', 13)}</button>
          <button class="prod-del btn-ghost px-1.5 text-[#C00000]" data-prod-idx="${i}" title="删除">${icon('x', 14)}</button>
        </td>
      </tr>`,
    )
    .join('');

  const sysChips = (list: string[], kind: 'sys' | 'int'): string =>
    list
      .map(
        (s, i) => `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-soft text-[12px] text-ink-soft">
          ${esc(s)}
          <button class="rm-opt text-ink-faint hover:text-[#C00000]" data-kind="${kind}" data-opt-idx="${i}" title="移除">${icon('x', 12)}</button>
        </span>`,
      )
      .join('');

  root.innerHTML = `
  <div class="max-w-[1200px] mx-auto space-y-4 view-enter">
    <!-- 团队成员库 -->
    <div class="card p-4">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('users', 17)} 团队成员库</div>
        <div class="flex items-center gap-1.5 text-[12px] text-ink-faint flex-wrap ml-1">
          ${(['all', 'tech', 'sales', 'dev', 'pm'] as const)
            .map(
              r =>
              `<button class="member-role-filter inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] ${memberRole === r ? 'text-white' : 'text-ink-soft bg-canvas'}" data-member-role="${r}" style="${memberRole === r ? `background:${roleColor(r)}` : ''}">${r === 'all' ? '全部' : ROLE_META[r].label}</button>`,
            )
            .join('')}
        </div>
        <div class="flex-1"></div>
        <div class="input flex items-center gap-2 px-2.5 py-1.5 w-56">
          <span class="text-ink-faint">${icon('search', 14)}</span>
          <input id="teamSearch" class="outline-none text-[13px] w-full bg-transparent" placeholder="搜索成员" />
        </div>
        <button id="teamNew" class="btn-primary">${icon('plus', 14)} 新增成员</button>
      </div>
      <div class="border border-line rounded-lg overflow-x-auto mt-3">
        <table class="w-full" style="min-width:760px">
          <thead>
            <tr class="text-left text-[12px] text-ink-faint border-b border-line bg-canvas/50">
              <th class="py-1.5 px-3 font-medium">姓名</th>
              <th class="py-1.5 px-3 font-medium">角色</th>
              <th class="py-1.5 px-3 font-medium">手机号</th>
              <th class="py-1.5 px-3 font-medium">部门</th>
              <th class="py-1.5 px-3 font-medium">邮箱</th>
              <th class="py-1.5 px-3 font-medium">参与项目</th>
              <th class="py-1.5 px-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody id="teamGrid">
            ${members.map(memberCard).join('') || '<tr><td colspan="7" class="px-4 py-6 text-center text-[12px] text-ink-faint">暂无成员</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between mt-2 text-[12px] text-ink-faint">
        <span>共 ${roleMembers.length} 名成员</span>
        <div class="flex items-center gap-2">
          <button class="member-page-prev btn-ghost px-2" ${memberPage <= 1 ? 'disabled' : ''}>上一页</button>
          <span>${memberPage} / ${pageCount}</span>
          <button class="member-page-next btn-ghost px-2" ${memberPage >= pageCount ? 'disabled' : ''}>下一页</button>
        </div>
      </div>
    </div>

    <!-- 产品/系统参数 -->
    <div class="card p-4">
      <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">
        ${icon('box', 17)} 产品 / 系统参数
        <span class="text-[11px] font-normal text-ink-faint">供项目「产品详情」选用，保存后全局生效</span>
      </div>

      <div class="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- 左：产品目录 -->
        <div class="flex flex-col">
          <div class="border border-line rounded-lg overflow-x-auto flex-1">
            <table class="w-full">
              <thead>
                <tr class="text-left text-[12px] text-ink-faint border-b border-line bg-canvas/50">
                  <th class="py-1.5 px-3 font-medium">产品 / 设备名称</th>
                  <th class="py-1.5 px-3 font-medium">规格 / 单位</th>
                  <th class="py-1.5 px-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>${catalogRows || '<tr><td colspan="3" class="px-4 py-4 text-center text-[12px] text-ink-faint">暂无产品目录</td></tr>'}</tbody>
            </table>
          </div>
          <div class="mt-2 flex">
            <button id="prodNew" class="btn ml-auto">${icon('plus', 13)} 新增产品</button>
          </div>
        </div>

        <!-- 右：系统参数 -->
        <div class="border border-line rounded-lg p-3 flex flex-col gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-[13px] font-medium text-ink">对接系统版本</span>
              <div class="flex-1"></div>
              <button class="add-opt btn-ghost text-brand-deep text-[12px]" data-kind="sys">${icon('plus', 12)} 添加</button>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-1.5">${sysChips(cfg.systems, 'sys') || '<span class="text-[12px] text-ink-faint">暂无</span>'}</div>
          </div>
          <div class="border-t border-hair pt-3">
            <div class="flex items-center gap-2">
              <span class="text-[13px] font-medium text-ink">集成系统</span>
              <div class="flex-1"></div>
              <button class="add-opt btn-ghost text-brand-deep text-[12px]" data-kind="int">${icon('plus', 12)} 添加</button>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-1.5">${sysChips(cfg.integrates, 'int') || '<span class="text-[12px] text-ink-faint">暂无</span>'}</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  // ===== 团队成员交互 =====
  const grid = root.querySelector('#teamGrid') as HTMLElement | null;
  const search = root.querySelector('#teamSearch') as HTMLInputElement | null;
  root.querySelectorAll<HTMLButtonElement>('[data-member-role]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.memberRole;
      if (next === 'all' || next === 'tech' || next === 'sales' || next === 'dev' || next === 'pm') {
        memberRole = next;
        memberPage = 1;
        renderTeam(root);
      }
    });
  });
  root.querySelector<HTMLButtonElement>('.member-page-prev')?.addEventListener('click', () => {
    memberPage = Math.max(1, memberPage - 1);
    renderTeam(root);
  });
  root.querySelector<HTMLButtonElement>('.member-page-next')?.addEventListener('click', () => {
    memberPage += 1;
    renderTeam(root);
  });
  search?.addEventListener('input', () => {
    const q = (search.value || '').trim().toLowerCase();
    root.querySelectorAll<HTMLElement>('[data-mid]').forEach(el => {
      el.style.display = !q || (el.textContent || '').toLowerCase().includes(q) ? '' : 'none';
    });
  });
  root.querySelector('#teamNew')?.addEventListener('click', () => openMemberModal(root));
  root.querySelectorAll('.tm-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-mid');
      const m = members.find(mm => mm.id === id);
      if (m) openMemberModal(root, m);
    });
  });
  root.querySelectorAll('.tm-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-mid');
      if (!id) return;
      const member = members.find(mm => mm.id === id);
      const inProjects = getProjects().filter(pr => [pr.teamOf?.tech, pr.teamOf?.sales, pr.teamOf?.dev].some(arr => arr?.some(m => m.id === id)));
      const mName = member ? member.name : '该成员';
      const refList = inProjects.length
        ? `<div class="mt-2 text-[12px] text-ink-soft">以下项目正在使用该成员（共 ${inProjects.length} 个）：</div>
           <div class="mt-1.5 max-h-36 overflow-y-auto rounded-md border border-hair bg-canvas/50 px-3 py-2 flex flex-col gap-1">
             ${inProjects.map(x => `<div class="flex items-center gap-2 text-[12.5px] text-ink"><span class="w-1.5 h-1.5 rounded-full bg-brand shrink-0"></span>${esc(x.name)}</div>`).join('')}
           </div>
           <div class="mt-2 text-[11.5px] text-[#C00000]">删除后这些项目中的该成员将置灰显示。</div>`
        : `<div class="mt-2 text-[12.5px] text-ink-soft">该成员尚未参与任何项目，可安全删除。</div>`;
      const bg = document.createElement('div');
      bg.className = 'modal-mask';
      bg.innerHTML = `<div class="bg-white rounded-lg w-[520px] max-w-full shadow-xl border border-line">
        <div class="modal-header">
          <div class="text-[15px] font-semibold text-ink flex items-center gap-2">${icon('alert', 16)} 删除成员</div>
          <button class="modal-close btn-ghost">${icon('x', 16)}</button>
        </div>
        <div class="px-5 py-4">
          <div class="text-[13.5px] text-ink">确定删除成员「<span class="font-semibold">${esc(mName)}</span>」吗？</div>
          ${refList}
        </div>
        <div class="flex justify-end gap-2 px-5 py-3.5 border-t border-hair bg-canvas/40 rounded-b-lg">
          <button class="modal-close btn">取消</button>
          <button id="tm-del-confirm" class="btn-primary" style="background:#C00000">确定删除</button>
        </div>
      </div>`;
      document.body.appendChild(bg);
      const close = (): void => bg.remove();
      bg.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', close));
      bg.addEventListener('click', e => { if (e.target === bg) close(); });
      bg.querySelector<HTMLButtonElement>('#tm-del-confirm')?.addEventListener('click', () => {
        removeTeamMember(id);
        toast('成员已删除');
        close();
      });
    });
  });

  // ===== 产品/系统参数交互 =====
  const reloadCfg = (): void => {
    // 重新读取配置后渲染资源目录区（仅刷新本卡片）
    const card = root.querySelectorAll<HTMLElement>('.card')[1];
    if (card) card.remove();
    renderTeam(root);
  };
  root.querySelector('#prodNew')?.addEventListener('click', () => openProductCfgModal(root, undefined, reloadCfg));
  root.querySelectorAll<HTMLElement>('.prod-del, .prod-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-prod-idx'));
      const c = getResourceConfig().catalog[idx];
      if (!c) return;
      if (btn.classList.contains('prod-del')) {
        const cfg2 = getResourceConfig();
        cfg2.catalog.splice(idx, 1);
        saveResourceConfig(cfg2);
        toast('产品已删除');
        renderTeam(root);
      } else if (btn.classList.contains('prod-edit')) {
        openProductCfgModal(root, c, reloadCfg);
      }
    });
  });
  root.querySelectorAll<HTMLElement>('.rm-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-kind');
      const idx = Number(btn.getAttribute('data-opt-idx'));
      const cfg2 = getResourceConfig();
      if (kind === 'sys' && cfg2.systems[idx]) cfg2.systems.splice(idx, 1);
      if (kind === 'int' && cfg2.integrates[idx]) cfg2.integrates.splice(idx, 1);
      saveResourceConfig(cfg2);
      renderTeam(root);
    });
  });
  root.querySelectorAll<HTMLElement>('.add-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-kind');
      const label = kind === 'sys' ? '对接系统版本' : '集成系统';
      openResourceOptionModal(root, kind === 'sys' ? 'sys' : 'int', label);
    });
  });
}

function openResourceOptionModal(root: HTMLElement, kind: 'sys' | 'int', label: string): void {
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="bg-white rounded-lg w-[420px] max-w-full shadow-xl border border-line">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-hair">
        <div class="text-[15px] font-semibold text-ink">${icon('plus', 16)} 添加${esc(label)}</div>
        <button class="modal-close btn-ghost" aria-label="关闭">${icon('x', 16)}</button>
      </div>
      <div class="px-5 py-4">
        <label class="field-label block">${esc(label)}名称 *</label>
        <input id="resource-option-value" class="input w-full mt-1.5" placeholder="请输入${esc(label)}名称" />
      </div>
      <div class="flex justify-end gap-2 px-5 py-3.5 border-t border-hair bg-canvas/40 rounded-b-lg">
        <button class="modal-close btn">取消</button>
        <button id="resource-option-save" class="btn-primary">保存</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const close = (): void => bg.remove();
  bg.querySelectorAll('.modal-close').forEach(el => el.addEventListener('click', close));
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  bg.querySelector<HTMLInputElement>('#resource-option-value')?.focus();
  bg.querySelector('#resource-option-save')?.addEventListener('click', () => {
    const input = bg.querySelector<HTMLInputElement>('#resource-option-value');
    const value = input?.value.trim() || '';
    if (!value) {
      toast(`请填写${label}名称`);
      input?.focus();
      return;
    }
    const cfg = getResourceConfig();
    const list = kind === 'sys' ? cfg.systems : cfg.integrates;
    if (list.includes(value)) {
      toast('该选项已存在');
      input?.focus();
      return;
    }
    list.push(value);
    saveResourceConfig(cfg);
    close();
    toast('资源参数已保存');
    renderTeam(root);
  });
}

/** 产品目录新增/编辑弹框 */
function openProductCfgModal(root: HTMLElement, c?: CatalogProduct, onSaved?: () => void): void {
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="bg-white rounded-lg w-[560px] max-w-full shadow-xl border border-line">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-hair">
        <div class="text-[15px] font-semibold text-ink">${icon('box', 16)} ${c ? '编辑产品' : '新增产品'}</div>
        <button class="modal-close btn-ghost">${icon('x', 16)}</button>
      </div>
      <div class="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-auto">
        <div><label class="field-label block">产品/设备名称 *</label><input id="rc-name" class="input w-full" value="${c ? esc(c.name) : ''}" placeholder="如：智能印章一体机" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label block">规格/单位</label><input id="rc-spec" class="input w-full" value="${c ? esc(c.spec) : ''}" placeholder="如：台 / 套 / 个" /></div>
        </div>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3.5 border-t border-hair bg-canvas/40 rounded-b-lg">
        <button class="modal-close btn">取消</button>
        <button id="rc-save" class="btn-primary">${c ? '保存修改' : '保存'}</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  bg.querySelectorAll('.modal-close').forEach(el => el.addEventListener('click', () => bg.remove()));

  bg.querySelector('#rc-save')?.addEventListener('click', () => {
    const name = ((bg.querySelector('#rc-name') as HTMLInputElement)?.value || '').trim();
    if (!name) { toast('请填写产品名称'); return; }
    const spec = ((bg.querySelector('#rc-spec') as HTMLInputElement)?.value || '').trim();
    const cfg2 = getResourceConfig();
    if (c) {
      const i = cfg2.catalog.findIndex(x => x.name === c.name);
      if (i >= 0) cfg2.catalog[i] = { name, spec };
    } else {
      cfg2.catalog.push({ name, spec });
    }
    saveResourceConfig(cfg2);
    bg.remove();
    toast('产品参数已保存');
    if (onSaved) onSaved();
  });
}

function openMemberModal(root: HTMLElement, m?: TeamMember): void {
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="bg-white rounded-lg w-[520px] max-w-full shadow-xl border border-line">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-hair">
        <div class="text-[15px] font-semibold text-ink">${icon('users', 16)} ${m ? '编辑成员' : '新增成员'}</div>
        <button class="modal-close btn-ghost">${icon('x', 16)}</button>
      </div>
      <div class="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-auto">
        <label class="field-label block">姓名 *</label>
        <input id="tm-name" class="input w-full" value="${m ? esc(m.name) : ''}" placeholder="成员姓名" />
        <label class="field-label block">角色（可多选）</label>
        <div class="flex gap-2 flex-wrap" id="tm-roles">
          ${(['tech', 'sales', 'dev', 'pm'] as const)
            .map(
              r =>
                `<button class="tm-role px-2.5 py-1 rounded-md text-[12px] transition-colors" data-role="${r}" style="border:1px solid ${ROLE_META[r].color};color:${ROLE_META[r].color};background:${m && m.roles.includes(r) ? ROLE_META[r].color : '#fff'};color:${m && m.roles.includes(r) ? '#fff' : ''};">${ROLE_META[r].label}</button>`,
            )
            .join('')}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label block">手机号</label><input id="tm-tel" class="input w-full" value="${m ? esc(m.tel) : ''}" /></div>
          <div><label class="field-label block">邮箱</label><input id="tm-mail" class="input w-full" value="${m ? esc(m.email) : ''}" placeholder="姓名全拼@qyunxi.com" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label block">所属部门</label><input id="tm-dept" class="input w-full" value="${m ? esc(m.dept) : ''}" /></div>
          <div><label class="field-label block">备注</label><input id="tm-note" class="input w-full" value="${m ? esc(m.note) : ''}" /></div>
        </div>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3.5 border-t border-hair bg-canvas/40 rounded-b-lg">
        <button class="modal-close btn">取消</button>
        <button id="tm-save" class="btn-primary">${m ? '保存修改' : '保存'}</button>
      </div>
    </div>`;
  document.body.appendChild(bg);

  bg.querySelectorAll('.modal-close').forEach(el =>
    el.addEventListener('click', () => bg.remove()),
  );
  const roles: ('tech' | 'sales' | 'dev' | 'pm')[] = m ? [...m.roles] : [];
  const nameInput = bg.querySelector<HTMLInputElement>('#tm-name');
  const mailInput = bg.querySelector<HTMLInputElement>('#tm-mail');
  let emailCustomized = Boolean(m?.email && m.email !== defaultMemberEmail(m.name));
  nameInput?.addEventListener('input', () => {
    if (!emailCustomized && mailInput) mailInput.value = defaultMemberEmail(nameInput.value.trim());
  });
  mailInput?.addEventListener('input', () => { emailCustomized = true; });
  bg.querySelectorAll<HTMLElement>('.tm-role').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = btn.getAttribute('data-role') as 'tech' | 'sales' | 'dev' | 'pm';
      const i = roles.indexOf(r);
      if (i >= 0) roles.splice(i, 1);
      else roles.push(r);
      const c = ROLE_META[r].color;
      const on = roles.includes(r);
      btn.style.background = on ? c : '#fff';
      btn.style.color = on ? '#fff' : c;
    });
  });

  bg.querySelector('#tm-save')?.addEventListener('click', () => {
    const name = (bg.querySelector('#tm-name') as HTMLInputElement).value.trim();
    if (!name) {
      toast('请填写成员姓名');
      return;
    }
    if (!roles.length) {
      toast('请至少选择一个角色');
      return;
    }
    const tel = (bg.querySelector('#tm-tel') as HTMLInputElement).value.trim();
    const email = (bg.querySelector('#tm-mail') as HTMLInputElement).value.trim();
    const dept = (bg.querySelector('#tm-dept') as HTMLInputElement).value.trim();
    const note = (bg.querySelector('#tm-note') as HTMLInputElement).value.trim();
    const data = { name, roles, tel, email, dept, note };
    if (m) {
      updateTeamMember(m.id, data);
    } else {
      addTeamMember({ id: `t${Date.now()}`, ...data });
    }
    bg.remove();
    toast(m ? '已保存修改' : '已新增成员');
    renderTeam(root);
  });
}