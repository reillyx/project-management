// 全局状态与 hash 路由
import { PROJECTS, TEMPLATES, TEAM } from './data/mock';
import type { Project, ProjectStage, Signature, TemplateDoc, TeamMember, TimeRecord } from './data/types';
import { PHASE_META } from './data/types';
import { diffDays, remindLevel, todayISO, presetSignature } from './lib';

// 可编辑状态：支持项目 / 成员 的增删改查
export const state = {
  projects: PROJECTS as Project[],
};

export interface SysSettings {
  brand: string;   // 品牌主色
  fs: number;      // 全局字号(px)
  remind3: boolean; // 提前3天提醒
  remind1: boolean; // 提前1天提醒
  remindDays: number; // 提醒窗口天数（默认 7）
  confirmDelete: boolean; // 删除前二次确认
  notifyEnabled?: boolean; // 浏览器通知开关
  notifyHour?: number; // 每日通知推送时刻（默认 9）
}
const SETTINGS_KEY = 'pm_settings_v1';
const LOGS_KEY = 'pm_logs';
export function getSettings(): SysSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<SysSettings>;
      return {
        brand: j.brand || '#5B9BD5',
        fs: typeof j.fs === 'number' && j.fs > 0 ? j.fs : 13,
        remind3: j.remind3 !== false,
        remind1: j.remind1 !== false,
        remindDays: typeof j.remindDays === 'number' && j.remindDays > 0 ? Math.floor(j.remindDays) : 7,
        confirmDelete: j.confirmDelete !== false,
        notifyEnabled: !!j.notifyEnabled,
        notifyHour: typeof j.notifyHour === 'number' ? j.notifyHour : 9,
      };
    }
  } catch { /* 忽略损坏数据 */ }
  return { brand: '#5B9BD5', fs: 13, remind3: true, remind1: true, remindDays: 7, confirmDelete: true, notifyEnabled: false, notifyHour: 9 };
}
export function saveSettings(p: Partial<SysSettings>): void {
  const next = { ...getSettings(), ...p };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    emitToast('数据保存失败，请检查浏览器存储');
  }
}

/** 统一的轻量 toast 通知（无依赖，避免循环引用） */
export function emitToast(msg: string): void {
  try { window.dispatchEvent(new CustomEvent('app:toast', { detail: msg })); } catch { /* noop */ }
}

/** 数据变更后广播，main.ts 订阅后重渲染当前视图并持久化到后端 */
export function publish(): void {
  window.dispatchEvent(new CustomEvent('state:changed'));
}

export function getProjects(): Project[] {
  return state.projects;
}

export function getProject(id: string): Project | undefined {
  return state.projects.find(p => p.id === id);
}

// ---------- 项目 CRUD ----------
export function addProject(p: Project): void {
  state.projects.push(p);
  addLog({ action: 'create', target: 'project', projectId: p.id, detail: `创建项目「${p.name}」（编号 ${p.code}）` });
  publish();
}
export function updateProject(id: string, patch: Partial<Project>): void {
  const i = state.projects.findIndex(p => p.id === id);
  if (i >= 0) {
    const prev = state.projects[i];
    Object.assign(prev, patch, { id });
    // 合同信息变化单独记一笔
    if (patch.contract) {
      addLog({ action: 'update', target: 'contract', projectId: id, detail: `修改「${prev.name}」合同信息（合同号 ${patch.contract.no || prev.contract?.no || ''}）` });
    }
    publish();
  }
}
export function removeProject(id: string): void {
  const p = getProject(id);
  state.projects = state.projects.filter(x => x.id !== id);
  if (p) addLog({ action: 'delete', target: 'project', projectId: id, detail: `删除项目「${p.name}」` });
  publish();
}
export function updateStage(id: string, key: string, patch: Partial<ProjectStage>): void {
  const p = getProject(id);
  if (!p) return;
  const st = p.stages.find(s => s.key === key);
  if (!st) return;
  Object.assign(st, patch);
  const stageName = (PHASE_META as Record<string, { name?: string }>)[key]?.name ?? key;
  if (patch.status) addLog({ action: 'status', target: 'stage', projectId: id, detail: stageActionText(p, stageName, key, patch.status) });
  publish();
}

let templateState: TemplateDoc[] = TEMPLATES.map(t => ({ ...t }));
export function getTemplates(): TemplateDoc[] {
  return templateState;
}
export function setTemplates(list: TemplateDoc[]): void {
  templateState = list.map(t => ({ ...t }));
}
export function updateTemplate(id: string, patch: Partial<TemplateDoc>): void {
  templateState = templateState.map(t => (t.id === id ? { ...t, ...patch } : t));
  publish();
}
export function addTemplate(tpl: TemplateDoc): void {
  templateState = [tpl, ...templateState];
  publish();
}
export function removeTemplate(id: string): void {
  templateState = templateState.filter(t => t.id !== id);
  publish();
}
/** 设为默认：同一时间仅一个默认模板 */
export function setDefaultTemplate(id: string): void {
  templateState = templateState.map(t => ({ ...t, isDefault: t.id === id }));
  publish();
}

// ---------- 电子签名 ----------
let sigState: Signature[] = [{
  id: 'sig_preset',
  name: '张启凡',
  dataURL: presetSignature('张启凡'),
  createdAt: new Date().toISOString().slice(0, 10),
  isDefault: true,
}];
export function getSignatures(): Signature[] {
  return sigState;
}
export function setSignatures(list: Signature[]): void {
  sigState = list.length ? list.map(s => ({ ...s })) : sigState;
}
export function addSignature(s: Signature): void {
  if (sigState.length === 0) s.isDefault = true;
  sigState.push(s);
  publish();
}
export function setDefaultSignature(id: string): void {
  sigState = sigState.map(s => ({ ...s, isDefault: s.id === id }));
  publish();
}
export function removeSignature(id: string): void {
  const idx = sigState.findIndex(s => s.id === id);
  if (idx < 0) return;
  const wasDefault = sigState[idx].isDefault === true;
  sigState = sigState.filter(s => s.id !== id);
  if (wasDefault && sigState.length) sigState[0].isDefault = true;
  publish();
}

// ---------- 工时记录（工时统计插件） ----------
let hourState: TimeRecord[] = [];
export function getHours(): TimeRecord[] {
  return hourState;
}
export function getProjectHours(projectId: string): TimeRecord[] {
  return hourState.filter(h => h.projectId === projectId);
}
export function addHour(r: TimeRecord): void {
  hourState.push(r);
  publish();
}
export function removeHour(id: string): void {
  hourState = hourState.filter(h => h.id !== id);
  publish();
}
export function setHours(list: TimeRecord[]): void {
  hourState = list.map(h => ({ ...h }));
}

const teamState: TeamMember[] = TEAM.slice();
export function getTeam(): TeamMember[] {
  return teamState;
}
// ---------- 团队成员 CRUD ----------
export function addTeamMember(m: TeamMember): void {
  teamState.push(m);
  addLog({ action: 'create', target: 'team', detail: `新增团队成员「${m.name}」` });
  publish();
}
export function updateTeamMember(id: string, patch: Partial<TeamMember>): void {
  const i = teamState.findIndex(m => m.id === id);
  if (i >= 0) {
    const prev = teamState[i].name;
    teamState[i] = { ...teamState[i], ...patch, id };
    addLog({ action: 'update', target: 'team', detail: `修改团队成员「${prev}」` });
    publish();
  }
}
export function removeTeamMember(id: string): void {
  const i = teamState.findIndex(m => m.id === id);
  if (i >= 0) {
    const name = teamState[i].name;
    teamState.splice(i, 1);
    addLog({ action: 'delete', target: 'team', detail: `移除团队成员「${name}」` });
    publish();
  }
}

/** 用后端数据整体替换（启动时指定展示来源） */
export function setProjects(list: Project[]): void {
  const teamNames = {
    tech: teamState.find(m => m.roles.includes('tech'))?.name || '',
    dev: teamState.find(m => m.roles.includes('dev'))?.name || '',
  };
  state.projects = list.map(project => ({
    ...project,
    tasks: (project.tasks || []).map(task => {
      const legacyRole = task.owner === '实施-李工' ? 'tech' : task.owner === '开发-张伟' ? 'dev' : '';
      return legacyRole && teamNames[legacyRole] ? { ...task, owner: teamNames[legacyRole] } : task;
    }),
  }));
}
export function setTeam(list: TeamMember[]): void {
  teamState.length = 0;
  teamState.push(...list);
}

export function activeStageIndex(p: Project): number {
  const idx = p.stages.findIndex(s => s.status === 'active');
  return idx === -1 ? p.stages.filter(s => s.status === 'done').length : idx;
}

export interface Route {
  view: string;
  projectId?: string;
  phase?: string;
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { view: 'dashboard' };
  const view = parts[0];
  const projectId = parts[1];
  const phase = parts[2];
  return { view, projectId, phase };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

/** 收集整个工作区 3 天窗口内的到期提醒 */
export interface ReminderItem {
  projectId: string;
  projectName: string;
  code: string;
  title: string;
  date: string;
  days: number;
  level: 'overdue' | 'urgent' | 'warning';
}

export function collectReminders(): ReminderItem[] {
  const s = getSettings();
  // 遵循系统设置：逾期(ore)恒提醒；提前1天受 remind1 控制；其余预警受 remind3 控制
  const keep = (level: ReminderItem['level']): boolean => {
    if (level === 'overdue') return true;
    if (level === 'urgent') return s.remind1;
    return s.remind3;
  };
  const items: ReminderItem[] = [];
  state.projects.forEach(p => {
    // 各阶段计划结束时间（未完成阶段）
    p.stages.forEach(st => {
      if (st.status === 'done') return;
      const days = diffDays(st.planEnd, todayISO());
      if (days <= (s.remindDays ?? 7)) {
        const level = remindLevel(days);
        if (!keep(level)) return;
        items.push({
          projectId: p.id,
          projectName: p.name,
          code: p.code,
          title: `阶段「${PHASE_META[st.key].name}」计划到期`,
          date: st.planEnd,
          days,
          level,
        });
      }
    });
    // 项目整体计划结束
    const pdays = diffDays(p.planEnd, todayISO());
    if (pdays <= (s.remindDays ?? 7)) {
      const level = remindLevel(pdays);
      if (!keep(level)) return;
      items.push({
        projectId: p.id,
        projectName: p.name,
        code: p.code,
        title: '项目整体计划到期',
        date: p.planEnd,
        days: pdays,
        level,
      });
    }
  });
  items.sort((a, b) => a.days - b.days);
  return items;
}

export function countAlerts(): { total: number; overdue: number; urgent: number; warning: number } {
  const items = collectReminders();
  return {
    total: items.length,
    overdue: items.filter(i => i.level === 'overdue').length,
    urgent: items.filter(i => i.level === 'urgent').length,
    warning: items.filter(i => i.level === 'warning').length,
  };
}

// ---------- 操作日志系统 ----------
export interface OperationLog {
  time: string;    // ISO 时间
  user: string;    // 操作人
  action: string;  // 动作：create/update/delete/status
  target: string;  // 对象类型：project/stage/task/contract/team/template/signature/settings
  projectId?: string;
  detail: string;  // 描述
}
const MAX_LOGS = 500;
/** 操作日志只保留近 7 天（按时间戳切） */
const LOG_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function loadLogs(): OperationLog[] {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    return raw ? (JSON.parse(raw) as OperationLog[]) : [];
  } catch { return []; }
}
function trimLogsByAge(logs: OperationLog[]): OperationLog[] {
  const cutoff = Date.now() - LOG_RETENTION_DAYS * DAY_MS;
  return logs.filter((l) => {
    const t = new Date(l.time).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}
function persistLogs(logs: OperationLog[]): void {
  try {
    // 先按时间切 7 天，再按条数兜底，防止单日内日志堆积过多
    const kept = trimLogsByAge(logs).slice(0, MAX_LOGS);
    localStorage.setItem(LOGS_KEY, JSON.stringify(kept));
  } catch { /* 忽略日志写入失败 */ }
}

/** 记录一条操作日志（time 自动生成，user 取当前登录人） */
export function addLog(entry: Omit<OperationLog, 'time' | 'user'>): void {
  const logs = loadLogs();
  let user = '';
  try {
    const raw = localStorage.getItem('pm_auth_v1');
    if (raw) {
      const a = JSON.parse(raw) as { username?: string; loggedIn?: boolean };
      if (a.loggedIn && a.username) user = a.username;
    }
  } catch { /* noop */ }
  logs.unshift({ ...entry, time: new Date().toISOString(), user });
  persistLogs(logs);
}

export function getLogs(): OperationLog[] {
  return loadLogs();
}
export function setLogs(logs: OperationLog[]): void {
  persistLogs(logs);
}
export function clearLogs(): void {
  persistLogs([]);
}
/** 阶段状态的日志文案（含提交验收等自然表达） */
export function stageActionText(p: Project, stageName: string, key: string, status: string): string {
  if (key === 'accept' && status === 'done') return `${p.code} ${p.name} 提交验收（${stageName}完成）`;
  if (status === 'done') return `${p.code} ${p.name} ${stageName}阶段完成`;
  if (status === 'active') return `${p.code} ${p.name} ${stageName}阶段开始`;
  return `${p.code} ${p.name} ${stageName}阶段 ${status}`;
}