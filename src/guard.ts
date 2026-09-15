// 页面离开守卫 + 滚动位置记忆：支持表单中途切换确认、列表返回恢复滚动
let dirtyApp = false;
const SCROLL_KEY = 'pm_scroll_v1';

export function setDirtyApp(v: boolean): void {
  dirtyApp = v;
}
export function isDirtyApp(): boolean {
  return dirtyApp;
}

/** 导航前询问：用户点「离开」返回 true（继续导航）。数据刷新（同 view 重渲染）不应弹窗。 */
export function confirmLeaving(oldHash: string, newHash: string): boolean {
  if (!dirtyApp) return true;
  // 去 hash 后比较：仅当真正切换视图（去掉尾部参数后再比对 path）才确认
  const path = (h: string) => h.replace(/^#/, '').split('?')[0];
  if (path(oldHash) === path(newHash)) return true;
  const ok = window.confirm('当前有未保存的编辑内容，确定要离开吗？');
  if (ok) dirtyApp = false;
  return ok;
}

/** 记住某 key 的滚动位置 */
export function saveScroll(key: string): void {
  try {
    const map = readScrollMap();
    map[key] = window.scrollY;
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** 恢复某 key 的滚动位置（一次性） */
export function restoreScroll(key: string): void {
  try {
    const map = readScrollMap();
    const y = map[key] || 0;
    if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  } catch {
    /* ignore */
  }
}

function readScrollMap(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}