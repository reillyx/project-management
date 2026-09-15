// 全局搜索：顶部常驻搜索框，按「项目/合同/任务/成员」分组模糊匹配，下拉结果跳转对应位置
import { getProjects, getTeam } from './store';
import type { Project, ProjectTask, TeamMember } from './data/types';
import { icon, esc } from './ui';

interface GroupItem {
  id: string;
  title: string;
  sub: string;
  icon: string;
  goto: () => void;
}

/** 收集全部命中的分组结果 */
function collectResults(kw: string): { label: string; items: GroupItem[] }[] {
  const q = kw.trim().toLowerCase();
  if (!q) return [];

  const groups: { label: string; items: GroupItem[] }[] = [
    { label: '项目', items: [] },
    { label: '合同', items: [] },
    { label: '任务', items: [] },
    { label: '成员', items: [] },
  ];
  const push = (label: string, it: GroupItem): void => {
    const g = groups.find(x => x.label === label);
    if (g) g.items.push(it);
  };

  getProjects().forEach(p => {
    const hitTo = (mask: string[]): boolean => mask.some(v => v && v.toLowerCase().includes(q));

    // 项目 / 编号 / 客户 / 负责人
    if (hitTo([p.name, p.customer, p.code, p.manager, p.category, p.remark ?? ''])) {
      push('项目', {
        id: p.id,
        title: p.name,
        sub: `${p.code} · ${p.customer}`,
        icon: 'folder',
        goto: () => { window.location.hash = `#/project/${p.id}`; },
      });
    }

    // 合同编号 / 合同名称
    if (hitTo([p.contract?.no ?? '', p.contract?.name ?? ''])) {
      push('合同', {
        id: p.id,
        title: p.contract?.name || p.contract?.no || '未命名合同',
        sub: `${p.name} · 合同号 ${p.contract?.no || '—'}`,
        icon: 'doc',
        goto: () => { window.location.hash = `#/project/${p.id}`; },
      });
    }

    // 任务名称
    (p.tasks || []).forEach((t: ProjectTask) => {
      if (t.name.toLowerCase().includes(q) || (t.owner && t.owner.toLowerCase().includes(q))) {
        push('任务', {
          id: `${p.id}-${t.id}`,
          title: t.name,
          sub: `${p.name} · ${t.owner || '未分配'}`,
          icon: 'check',
          goto: () => { window.location.hash = `#/project/${p.id}`; },
        });
      }
    });
  });

  // 团队成员姓名 / 部门 / 角色
  getTeam().forEach((m: TeamMember) => {
    if ([m.name, m.tel, m.email, m.dept].some(v => v && v.toLowerCase().includes(q))) {
      push('成员', {
        id: m.id,
        title: m.name,
        sub: `${m.dept || '—'} · ${m.roles.join('/')}`,
        icon: 'user',
        goto: () => { window.location.hash = '#/team'; },
      });
    }
  });

  return groups.filter(g => g.items.length > 0);
}

/** 创建并挂载全局搜索交互（附带分组结果下拉层） */
export function wireGlobalSearch(): void {
  const search = document.getElementById('globalSearch') as HTMLInputElement | null;
  if (!search) return;

  let dropdown: HTMLDivElement | null = null;
  let timer = 0;
  let lastKw = '';

  const removeDropdown = (): void => {
    dropdown?.remove();
    dropdown = null;
    lastKw = '';
  };

  const renderResults = (kw: string): void => {
    const groups = collectResults(kw);
    dropdown?.remove();
    dropdown = document.createElement('div');
    dropdown.className =
      'search-drop absolute left-0 right-0 top-full mt-1.5 bg-white border border-line rounded-lg shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto';

    if (groups.length === 0) {
      dropdown.innerHTML = `<div class="px-3.5 py-3 text-[12px] text-ink-faint text-center">未找到与「${esc(kw.trim())}」匹配的内容</div>`;
    } else {
      const sectionHtml = groups
        .map(g => {
          const rows = g.items.slice(0, 6).map(it => `
            <button data-search-goto="${esc(it.id)}" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-brand-soft text-left border-b border-hair last:border-b-0">
              <span class="w-7 h-7 rounded flex items-center justify-center shrink-0 bg-brand-light text-brand-deep">${icon(it.icon, 14)}</span>
              <span class="flex-1 min-w-0">
                <span class="block text-[13px] text-ink truncate">${highlight(it.title, kw)}</span>
                <span class="block text-[11px] text-ink-faint truncate">${esc(it.sub)}</span>
              </span>
              <span class="text-ink-faint shrink-0">${icon('chevron', 12)}</span>
            </button>`);
          return `<div class="px-3 py-1.5 text-[11px] font-semibold text-ink-faint bg-canvas/50 border-b border-hair flex items-center gap-1.5">${g.label}
            <span class="text-[10px] font-normal text-ink-faint/70">${g.items.length}</span></div>${rows}`;
        })
        .join('');
      dropdown.innerHTML = `${sectionHtml}
        <button data-search-all class="w-full px-3.5 py-2.5 text-[12px] text-brand-deep hover:bg-brand-soft text-left">在列表中查看更多… ${icon('chevron', 12)}</button>`;
    }

    const wrap = search.parentElement;
    if (wrap) wrap.appendChild(dropdown);

    const sectionOf = (id: string): string => {
      for (const g of groups) if (g.items.some(it => it.id === id)) return g.label;
      return '';
    };

    dropdown.querySelectorAll<HTMLElement>('[data-search-goto]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-search-goto') ?? '';
        const g = groups.find(x => x.items.some(it => it.id === id));
        const it = g?.items.find(x => x.id === id);
        removeDropdown();
        search.value = '';
        it?.goto();
      });
    });

    // 空态下的「查看全部」
    dropdown.querySelector<HTMLElement>('[data-search-all]')?.addEventListener('click', () => {
      removeDropdown();
      search.value = '';
      // 跳转到首个匹配分组所在页面
      const first = groups[0];
      if (first) first.items[0]?.goto();
      else window.location.hash = '#/projects';
    });
    void sectionOf;
  };

  const highlight = (text: string, kw: string): string => {
    const q = kw.trim().toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return esc(text);
    return `${esc(text.slice(0, idx))}<b class="text-brand-deep">${esc(text.slice(idx, idx + q.length))}</b>${esc(text.slice(idx + q.length))}`;
  };

  // 输入即搜（防抖 300ms）
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const kw = search.value;
      if (kw !== lastKw) {
        lastKw = kw;
        renderResults(kw);
      }
    }, 300);
  });

  search.addEventListener('focus', () => {
    if (search.value.trim()) renderResults(search.value);
  });

  // 失焦关闭（延迟让点击生效）
  document.addEventListener('click', (e: MouseEvent) => {
    const t = e.target as Node;
    if (!search.contains(t) && dropdown && !dropdown.contains(t)) {
      removeDropdown();
    }
  });

  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') removeDropdown();
    if (e.key === 'Enter' && search.value.trim()) {
      const groups = collectResults(search.value);
      if (groups.length) {
        const kw = search.value;
        removeDropdown();
        search.value = '';
        groups[0].items[0]?.goto();
      }
    }
  });
}