// 应用外壳：顶栏 + 侧边导航 + 内容容器
import { countAlerts } from '../store';
import { icon } from '../ui';

interface NavItem {
  view: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { view: 'dashboard', label: '工作台', icon: 'grid' },
  { view: 'projects', label: '项目列表', icon: 'list' },
  { view: 'tasks', label: '任务清单', icon: 'check' },
  { view: 'files', label: '文件管理', icon: 'folder' },
  { view: 'team', label: '资源明细', icon: 'box' },
  { view: 'templates', label: '文档模板', icon: 'doc' },
  { view: 'export', label: '数据导出', icon: 'export' },
  { view: 'logs', label: '操作日志', icon: 'list' },
  { view: 'plugins', label: '插件中心', icon: 'plug' },
  { view: 'settings', label: '系统设置', icon: 'settings' },
];

/** 构建外壳骨架到 #app（只执行一次） */
export function renderShell(app: HTMLElement): void {
  app.innerHTML = `
  <div id="appShell" class="flex h-screen overflow-hidden bg-canvas text-ink">
    <aside class="w-56 shrink-0 border-r border-line bg-white flex flex-col">
      <div class="flex items-center gap-2.5 px-4 h-14 border-b border-hair">
        <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm" style="background:linear-gradient(135deg,#5B9BD5,#3D74A8)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4.5" width="14" height="4" rx="1.2" fill="#FFFFFF" opacity="0.95"/>
            <rect x="3" y="10.5" width="10" height="4" rx="1.2" fill="#FFFFFF" opacity="0.72"/>
            <rect x="3" y="16.5" width="17" height="4" rx="1.2" fill="#FFFFFF" opacity="0.5"/>
            <circle cx="19" cy="12.5" r="2.3" fill="#70AD47" stroke="#FFFFFF" stroke-width="1.2"/>
          </svg>
        </div>
        <div class="leading-tight">
          <div class="text-[14px] font-semibold text-ink">项目管理系统</div>
          <div class="text-[9.5px] text-ink-faint tracking-[0.12em]" style="color:#5B9BD5">PROJECT&nbsp;HUB&nbsp;·&nbsp;IT</div>
        </div>
      </div>
      <nav id="nav" class="flex-1 px-2.5 py-3 space-y-0.5"></nav>
      <div class="px-3 py-3 border-t border-hair text-[11px] text-ink-faint">
        <div class="flex items-center gap-1.5">${icon('settings', 13)} 单机版 · 本地数据</div>
      </div>
    </aside>
    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-14 shrink-0 border-b border-line bg-white flex items-center gap-3 px-4">
        <div id="viewTitle" class="text-[15px] font-semibold text-ink whitespace-nowrap">工作台</div>
        <div class="flex-1"></div>
        <div class="flex items-center gap-2">
          <div class="relative">
            <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">${icon('search', 14)}</span>
            <input id="globalSearch" class="input pl-8 w-52" placeholder="搜索项目 / 客户 / 编号" />
          </div>
          <button id="headerBell" class="btn relative px-2.5" title="到期提醒">${icon('bell', 16)}
            <span id="bellCount" class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#C00000] text-white text-[10px] flex items-center justify-center">0</span>
          </button>
          <button id="headerExport" class="btn">${icon('export', 14)} 导出</button>
          <button id="headerNew" class="btn-primary">${icon('plus', 14)} 新建项目</button>
          <div class="w-px h-6 bg-line mx-0.5"></div>
          <button id="headerProfile" class="btn flex items-center gap-2" title="个人中心">
            <span id="headerAvatar" class="w-6 h-6 rounded-full bg-brand-light text-brand-deep text-[11px] font-semibold flex items-center justify-center overflow-hidden"></span>
            <span id="headerUserName" class="text-[13px]"></span>
            ${icon('chevron', 13)}
          </button>
          <button id="headerLogout" class="btn-ghost px-2.5 text-ink-soft" title="退出登录">${icon('logout', 15)} <span class="text-[13px]">退出</span></button>
        </div>
      </header>
      <main id="viewRoot" class="flex-1 overflow-auto p-4"></main>
    </div>
  </div>
  <div id="loginLayer" class="fixed inset-0 z-50 overflow-auto hidden"></div>`;
}

/** 控制外壳与登录层的显隐：logged=false 时全屏显示登录页 */
export function setAuthenticated(logged: boolean): void {
  const shell = document.getElementById('appShell');
  const layer = document.getElementById('loginLayer');
  if (shell) shell.classList.toggle('hidden', !logged);
  if (layer) layer.classList.toggle('hidden', logged);
}

/** 顶栏显示当前用户头像/姓名 */
export function updateHeaderUser(name: string, avatar: string): void {
  const nameEl = document.getElementById('headerUserName');
  const avatarEl = document.getElementById('headerAvatar');
  if (nameEl) nameEl.textContent = name;
  if (avatarEl) {
    avatarEl.innerHTML = avatar
      ? `<img src="${avatar}" alt="" class="w-full h-full object-cover" />`
      : `<span>${(name || '管').slice(0, 1)}</span>`;
  }
}

export function renderNav(activeView: string): void {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = NAV.map(
    n => `
    <a href="#/${n.view}" data-view="${n.view}"
       class="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors cursor-pointer ${
         n.view === activeView
           ? 'bg-brand-light text-brand-deep font-medium'
           : 'text-ink-soft hover:bg-brand-soft'
       }">
      ${icon(n.icon, 16)}
      ${n.label}
    </a>`,
  ).join('');
}

export function setViewTitle(title: string): void {
  const el = document.getElementById('viewTitle');
  if (el) el.textContent = title;
}

export function updateBell(): void {
  const c = countAlerts();
  const el = document.getElementById('bellCount');
  if (el) {
    el.textContent = String(c.total);
    el.style.display = c.total > 0 ? 'flex' : 'none';
    el.style.background = c.overdue > 0 ? '#C00000' : '#E36C0A';
  }
}