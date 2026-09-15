// 浏览器通知：开启权限 + 每日上午 9 点自动推送到期任务提醒（页面运行期间轮询）
import { collectReminders, getSettings, saveSettings } from './store';

const NOTIFY_DONE_KEY = 'pm_notify_done'; // 记录当日已推送的日期，避免重复
const NOTIFY_SENT_KEY = 'pm_notify_sent'; // 记录当日已推送过的提醒 id 集
const NOTIFY_LOCK_KEY = 'pm_notify_lock'; // 多 tab 推送互斥锁：同一批提醒 5 秒内只允许一个 tab 发送

/**
 * 抢占推送锁：localStorage 无原子 CAS，故先写入归属标记，再延时等待并发写收敛后
 * 读回校验——若锁仍归本 tab（时间戳未被新写入覆盖）则可发送，否则放弃，交由抢占它的 tab 推送。
 * @param key 锁标识（如 `daily-2026-09-11`）
 */
function acquireNotifyLock(key: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const t = Date.now();
      localStorage.setItem(NOTIFY_LOCK_KEY, JSON.stringify({ id: key, t }));
      // 让并发写入的多个 tab 在同一 tick 后趋于一致，再校验归属
      window.setTimeout(() => {
        let mine = true;
        try {
          const cur = JSON.parse(localStorage.getItem(NOTIFY_LOCK_KEY) ?? 'null') as { id?: string; t?: number } | null;
          // 锁仍归自己，且在 5 秒有效期内
          mine = !!(cur && cur.id === key && typeof cur.t === 'number' && Date.now() - cur.t < 5000);
        } catch {
          mine = false;
        }
        resolve(mine);
      }, 25);
    } catch {
      resolve(true);
    }
  });
}

/** 浏览器是否支持 Notification */
export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 当前通知权限状态 */
export function notifyPermission(): NotificationPermission | 'unsupported' {
  if (!notifySupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * 申请通知权限。
 * @returns true 表示已获得 granted 权限
 */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!notifySupported()) return false;
  try {
    if (Notification.permission === 'granted') return true;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch {
    return false;
  }
}

function isPushEnabled(): boolean {
  return getSettings().notifyEnabled === true && notifySupported() && Notification.permission === 'granted';
}

/** 构造本次要推送的提醒文案；返回 { id, title, body } 数组 */
function buildPayloads(): Array<{ id: string; title: string; body: string }> {
  const items = collectReminders();
  const out: Array<{ id: string; title: string; body: string }> = [];
  const pushFor = (it: (typeof items)[number], tag: string) => {
    if (it.days < 0) {
      out.push({ id: `${it.projectId}:${it.code}:overdue`, title: `项目预警：已逾期`, body: `「${it.projectName}」${it.title}，已逾期 ${-it.days} 天` });
    } else if (it.days === 0) {
      out.push({ id: `${it.projectId}:${it.code}:today`, title: `项目预警：今日到期`, body: `「${it.projectName}」${it.title}，今天到期` });
    } else if (it.days <= 3) {
      out.push({ id: `${it.projectId}:${it.code}:soon`, title: `项目预警：临近到期`, body: `「${it.projectName}」${it.title}，还有 ${it.days} 天到期` });
    }
  };
  items.forEach(it => pushFor(it, it.level));
  return out;
}

/** 立即推送一条通知 */
export function pushNow(title: string, body: string): void {
  if (!isPushEnabled()) return;
  try {
    new Notification(title, { body, tag: 'pm-reminder', icon: undefined });
  } catch {
    try { new Notification(title, { body }); } catch { /* noop */ }
  }
}

function iconForTag(tag: string): string {
  return tag === 'overdue' ? '🔴' : tag === 'today' ? '⚠️' : '⏰';
}

/** 每日一次：在目标时刻推送当天到期的提醒（幂等，同一提醒当天只推一次，多 tab 互斥推送） */
async function dailyCheck(): Promise<void> {
  if (!isPushEnabled()) return;
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  // 记录已推日期
  let doneDate = '';
  try { doneDate = localStorage.getItem(NOTIFY_DONE_KEY) ?? ''; } catch { /* noop */ }
  if (doneDate === today) return;

  const payloads = buildPayloads();
  const prevSent: string[] = [];
  try { prevSent.push(...(JSON.parse(localStorage.getItem(NOTIFY_SENT_KEY) ?? '[]') as string[])); } catch { /* noop */ }

  const fresh = payloads.filter(p => !prevSent.includes(p.id));

  // 多 tab 互斥：同一批提醒同一时刻只允许一个 tab 发送，避免重复推送
  if (fresh.length > 0 && (await acquireNotifyLock(`daily-${today}`))) {
    fresh.forEach(p => {
      pushNow(`${iconForTag(p.id.endsWith('overdue') ? 'overdue' : p.id.endsWith('today') ? 'today' : 'soon')} ${p.title}`, p.body);
    });
  }

  // 记录本次已推送的 id（避免重复），并标记当日完成
  try {
    localStorage.setItem(NOTIFY_SENT_KEY, JSON.stringify([...new Set([...prevSent, ...payloads.map(p => p.id)])]));
    localStorage.setItem(NOTIFY_DONE_KEY, today);
  } catch { /* noop */ }
}

/** 启动每日定时轮询（应用运行期间每分钟检查一次目标时刻，通常 09:00） */
export function startNotifyScheduler(): void {
  if (!notifySupported()) return;
  const tick = (): void => {
    const s = getSettings();
    const hour = typeof s.notifyHour === 'number' ? s.notifyHour : 9;
    const now = new Date();
    if (now.getHours() === hour && now.getMinutes() === 0) {
      void dailyCheck();
    }
  };
  tick();
  window.setInterval(tick, 60_000);
}

/** 切换通知开关；首次开启时请求权限，返回是否成功开启 */
export async function setNotifyEnabled(on: boolean): Promise<{ opened: boolean; permission: string }> {
  if (!on) {
    saveSettings({ notifyEnabled: false });
    return { opened: false, permission: 'off' };
  }
  if (!notifySupported()) {
    return { opened: false, permission: 'unsupported' };
  }
  if (Notification.permission !== 'granted') {
    await requestNotifyPermission();
  }
  if (Notification.permission === 'granted') {
    saveSettings({ notifyEnabled: true });
    // 开启后立即补一次检查
    void dailyCheck();
    return { opened: true, permission: 'granted' };
  }
  return { opened: false, permission: Notification.permission };
}