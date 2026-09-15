// 应用入口：构建外壳 + hash 路由分发各视图 + 后端同步/持久化
import {
  getProjects,
  getTeam,
  getTemplates,
  getSignatures,
  parseRoute,
  setProjects,
  setTeam,
  setTemplates,
  setSignatures,
  getHours,
  setHours,
  getLogs,
  setLogs,
  getSettings,
} from './store';
import { applySysSettings } from './lib';
import { confirmLeaving, saveScroll, restoreScroll, setDirtyApp, isDirtyApp } from './guard';
import { renderShell, renderNav, setViewTitle, updateBell, setAuthenticated, updateHeaderUser } from './views/layout';
import { renderDashboard } from './views/dashboard';
import { renderReminders } from './views/reminders';
import { renderProjects, openNewModal } from './views/projects';
import { renderGanttPage } from './views/ganttpage';
import { renderProjectDetail } from './views/project';
import { renderFiles } from './views/files';
import { renderTasks, wireTasks } from './views/tasks';
import { renderTemplates } from './views/templates';
import { renderPlugins } from './views/plugins';
import { renderTeam } from './views/team';
import { renderSettings } from './views/settings';
import { renderExport, exportExcel, exportReport } from './views/export';
import { renderLogs } from './views/logs';
import { renderLogin } from './views/login';
import { renderProfile } from './views/profile';
import { wireGlobalSearch } from './search';
import { startNotifyScheduler } from './notify';
import { isLoggedIn, logout, getProfile, currentUser } from './auth';
import { api } from './api';
import { icon, toast } from './ui';

const TITLES: Record<string, string> = {
  dashboard: '工作台',
  projects: '项目列表',
  project: '项目详情',
  gantt: '阶段甘特',
  reminders: '到期提醒',
  files: '文件管理',
  tasks: '任务清单',
  templates: '文档模板',
  plugins: '插件中心',
  team: '资源明细',
  settings: '系统设置',
  export: '数据导出',
  logs: '操作日志',
  profile: '个人中心',
};

export function initApp(): void {
  const app = document.getElementById('app');
  if (!app) return;
  renderShell(app);
  wireHeader();
  render();
  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);
  window.addEventListener('state:changed', onDataChanged);
  window.addEventListener('plugin:changed', render);
  window.addEventListener('app:toast', ((e: Event) => {
    const detail = (e as CustomEvent<string>).detail;
    if (detail) toast(detail);
  }) as EventListener);
  applySysSettings(getSettings());
  startNotifyScheduler();
  // 列表页滚动位置记忆：滚动时防抖保存当前视图
  let scrollTimer = 0;
  window.addEventListener('scroll', () => {
    if (scrollTimer) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      const v = parseRoute(window.location.hash);
      if (v.view) saveScroll(v.view);
    }, 200);
  });
  // 页面关闭/刷新时若有未保存编辑则提示
  window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    if (isDirtyApp()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  void boot();
}

/** store 数据变更：重渲染当前视图 + 防抖持久化到后端 */
let persistTimer = 0;
function onDataChanged(): void {
  render();
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void persist();
  }, 400);
}

let seeded = false;
let currentHash = window.location.hash;

/** 把当前内存数据全量写入后端 data/db.json（前端是唯一写入口时用于持久化） */
async function persist(): Promise<void> {
  try {
    await api.postSync({
      projects: getProjects(),
      team: getTeam(),
      templates: getTemplates(),
      signatures: getSignatures(),
      hours: getHours(),
      logs: getLogs(),
      settings: { seeded },
    });
  } catch {
    /* 后端不可用：数据仍留在本地，先提示用户存储状态 */
    window.dispatchEvent(new CustomEvent('app:toast', { detail: '数据保存失败，请检查浏览器存储' }));
  }
}

/** 启动时从后端恢复上一次保存的数据；后端无有效数据则回退本地种子并写回，避免空库覆盖本地基线 */
async function boot(): Promise<void> {
  try {
    const s = await api.fetchSync();
    // 以后端「是否存在真实项目」作为已初始化判据；projects 为空（未初始化或被误清空）时
    // 绝不覆盖本地种子，直接以本地种子为基线写回，防止“数据闪一下就没了”。
    const hasProjects = Array.isArray(s.projects) && s.projects.length > 0;
    if (!hasProjects) {
      seeded = true;
      await persist();
      render();
      return;
    }
    seeded = true;
    setProjects(s.projects);
    if (Array.isArray(s.team) && s.team.length > 0) setTeam(s.team);
    // 模板：若后端已是富文本结构（≥内置套数且内置项均含 contentHTML）则恢复（含用户编辑/上传），
    // 否则以本地内置富文本模板为准并将新模板写回后端完成升级。
    const hasRichTemplates = Array.isArray(s.templates) && s.templates.length >= getTemplates().length &&
      s.templates.filter((t: { builtin?: boolean }) => t.builtin).every((t: { contentHTML?: string }) => t.contentHTML);
    if (Array.isArray(s.templates) && hasRichTemplates) {
      setTemplates(s.templates);
    }
    if (Array.isArray(s.signatures) && s.signatures.length > 0) setSignatures(s.signatures);
    if (Array.isArray(s.hours) && s.hours.length > 0) setHours(s.hours);
    if (Array.isArray(s.logs)) setLogs(s.logs);
    await persist();
    render();
  } catch {
    /* 后端不可用：保持本地种子 */
  }
}

function render(): void {
  const prevHash = currentHash;
  const prevRouteView = parseRoute(prevHash).view;
  const route = parseRoute(window.location.hash);

  // 表单离开守卫：已登录且真正切换视图时确认，取消则回退 hash
  if (isLoggedIn() && prevHash && prevHash !== window.location.hash) {
    if (!confirmLeaving(prevHash, window.location.hash)) {
      window.location.hash = prevHash;
      return;
    }
    if (prevRouteView) saveScroll(prevRouteView);
  }
  currentHash = window.location.hash;

  // 登录页/未登录守卫：未登录访问任何路由都落到登录页
  if (route.view === 'login' || !isLoggedIn()) {
    if (isLoggedIn()) {
      // 已登录还访问登录页 → 直接进工作台
      window.location.hash = '#/dashboard';
      return;
    }
    setAuthenticated(false);
    const layer = document.getElementById('loginLayer');
    if (layer) {
      renderLogin(layer);
    }
    return;
  }

  setAuthenticated(true);
  const profile = getProfile();
  updateHeaderUser(profile.name || currentUser(), profile.avatar || '');

  const root = document.getElementById('viewRoot');
  if (!root) return;
  setViewTitle(TITLES[route.view] ?? '工作台');
  renderNav(navViewOf(route.view, route.projectId));
  updateBell();

  switch (route.view) {
    case 'dashboard':
      renderDashboard(root, route);
      break;
    case 'reminders':
      renderReminders(root);
      break;
    case 'projects':
      renderProjects(root);
      break;
    case 'project':
      renderProjectDetail(root, route.projectId ?? '');
      break;
    case 'gantt':
      renderGanttPage(root, route);
      break;
    case 'files':
      renderFiles(root, route.projectId, route.phase);
      break;
    case 'tasks':
      root.innerHTML = renderTasks();
      wireTasks();
      break;
    case 'templates':
      renderTemplates(root);
      break;
    case 'plugins':
      renderPlugins(root);
      break;
    case 'team':
      renderTeam(root);
      break;
    case 'settings':
      renderSettings(root);
      break;
    case 'export':
      renderExport(root);
      break;
    case 'logs':
      renderLogs(root);
      break;
    case 'profile':
      renderProfile(root);
      break;
    default:
      renderDashboard(root, route);
  }

  // 恢复该视图上次的滚动位置（列表页返回记忆）
  restoreScroll(route.view);
}

function navViewOf(view: string, projectId?: string): string {
  // files 带 projectId 表示单项目文件浏览（归属项目列表高亮），一级菜单进入则高亮「文件管理」
  if (view === 'files') return projectId ? 'projects' : 'files';
  if (view === 'project' || view === 'gantt') return 'projects';
  return view;
}

function wireHeader(): void {
  const bell = document.getElementById('headerBell');
  bell?.addEventListener('click', () => {
    window.location.hash = '#/reminders';
  });

  // 全局搜索：常驻搜索框 + 防抖下拉（wireGlobalSearch 内部自行绑定 input）
  wireGlobalSearch();

  const exportBtn = document.getElementById('headerExport');
  exportBtn?.addEventListener('click', () => {
    toggleExportMenu(exportBtn);
  });

  const newBtn = document.getElementById('headerNew');
  newBtn?.addEventListener('click', () => {
    window.location.hash = '#/projects';
    setTimeout(() => {
      const root = document.getElementById('viewRoot');
      if (root) openNewModal(root);
    }, 60);
  });

  const profileBtn = document.getElementById('headerProfile');
  profileBtn?.addEventListener('click', () => {
    window.location.hash = '#/profile';
  });

  const logoutBtn = document.getElementById('headerLogout');
  logoutBtn?.addEventListener('click', () => {
    logout();
    render();
  });

  // 个人中心保存资料后刷新顶栏头像/姓名
  window.addEventListener('profile:changed', () => {
    const p = getProfile();
    updateHeaderUser(p.name || currentUser(), p.avatar || '');
  });
}

function toggleExportMenu(anchor: HTMLElement): void {
  document.querySelectorAll('.export-menu').forEach(el => el.remove());
  const menu = document.createElement('div');
  menu.className =
    'export-menu absolute right-0 top-full mt-1 w-56 bg-white border border-line rounded-lg shadow-xl z-20 overflow-hidden';
  menu.innerHTML = `
    <div class="px-3 py-2 text-[11px] text-ink-faint border-b border-hair">数据导出</div>
    <button class="exp-item w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-ink hover:bg-brand-soft text-left"><span class="text-brand-deep">${icon('export', 15)}</span>导出项目清单 Excel（.xls）</button>
    <button class="exp-item w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-ink hover:bg-brand-soft text-left"><span class="text-brand-deep">${icon('doc', 15)}</span>生成项目汇总报告</button>
  `;
  const wrap = anchor.parentElement;
  if (!wrap) return;
  wrap.appendChild(menu);
  const items = menu.querySelectorAll('.exp-item');
  items[0]?.addEventListener('click', () => {
    exportExcel();
    toast('项目清单已导出为 Excel', 'success');
    menu.remove();
  });
  items[1]?.addEventListener('click', () => {
    exportReport();
    toast('已生成项目汇总报告', 'success');
    menu.remove();
  });
  const close = (e: Event) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}