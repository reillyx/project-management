// 插件注册中心：启用/禁用状态（localStorage）
export interface PluginDef {
  id: string;
  name: string;
  desc: string;
  version: string;
  icon: string;
  builtin?: boolean;
}

export const PLUGIN_DEFS: PluginDef[] = [
  {
    id: 'hours',
    name: '工时统计插件',
    desc: '在项目详情记录与汇总工时，按项目 / 人员 / 阶段输出报表，支持导出 Excel。',
    version: '1.0.0',
    icon: 'clock',
  },
  {
    id: 'gantt-print',
    name: '甘特打印插件',
    desc: '将甘特图渲染为 A4 横向打印版，包含项目名、阶段时间线、任务条与负责人。',
    version: '1.0.0',
    icon: 'printer',
  },
  {
    id: 'dashboard',
    name: '数据看板插件',
    desc: '在工作台展示项目统计（总数/进行中/待验收/预警）、金额汇总与项目状态/月度趋势图表。',
    version: '1.0.0',
    icon: 'chart',
  },
  {
    id: 'notify',
    name: '自动通知插件',
    desc: '项目阶段变更时自动生成通知文档（上线/变更/会议/培训），可在模板中心预览编辑并导出 Word。',
    version: '1.0.0',
    icon: 'megaphone',
  },
];

const KEY = 'pm_plugins_v1';
let enabledCache: Record<string, boolean> | null = null;

function load(): Record<string, boolean> {
  if (enabledCache) return enabledCache;
  try {
    const raw = localStorage.getItem(KEY);
    enabledCache = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    enabledCache = {};
  }
  return enabledCache!;
}

function save(): void {
  localStorage.setItem(KEY, JSON.stringify(enabledCache ?? {}));
}

/** 默认启用；显式设置为 false 才视为禁用 */
export function isPluginEnabled(id: string): boolean {
  const map = load();
  return map[id] !== false;
}

export function setPluginEnabled(id: string, on: boolean): void {
  const map = load();
  map[id] = on;
  enabledCache = map;
  save();
  // 通知应用刷新视图
  window.dispatchEvent(new CustomEvent('plugin:changed', { detail: { id, enabled: on } }));
}

export function isOn(id: string): boolean {
  return isPluginEnabled(id);
}