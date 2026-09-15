// 资源明细：产品/系统/集成参数的可配置字典（localStorage 持久化）
// 供项目详情的「产品详情」使用；后续其它模块也可从这里取用。

export interface CatalogProduct {
  name: string;      // 产品/设备名称
  spec: string;      // 规格/单位（如：台 / 套 / 个）
}

export interface ResourceConfig {
  catalog: CatalogProduct[];
  systems: string[];     // 对接系统版本可选值（默认 2.0 / 3.01）
  integrates: string[];  // 集成系统可选值
}

const KEY = 'pm_resource_v1';

const DEFAULT_CONFIG: ResourceConfig = {
  catalog: [
    { name: '智能印章一体机', spec: '台' },
    { name: '门禁控制器', spec: '套' },
    { name: '人脸识别终端', spec: '台' },
    { name: 'OA 办公系统', spec: '套' },
    { name: '高拍仪', spec: '台' },
    { name: '访客一体机', spec: '台' },
    { name: '高清摄像头', spec: '台' },
    { name: '智慧门锁', spec: '套' },
  ],
  systems: ['2.0', '3.01'],
  integrates: ['OA 系统', '企业微信', '钉钉', '门禁管理平台', '安防平台', '高拍仪对接', 'ERP 系统'],
};

function normalize(raw: Partial<ResourceConfig>): ResourceConfig {
  const base = DEFAULT_CONFIG;
  if (!raw) return base;
  const catalog = Array.isArray(raw.catalog)
    ? raw.catalog.filter((c): c is CatalogProduct => !!c && typeof c.name === 'string')
    : base.catalog;
  if (!catalog.length) catalog.push(...base.catalog);
  return {
    catalog,
    systems: Array.isArray(raw.systems) && raw.systems.length ? raw.systems : base.systems,
    integrates: Array.isArray(raw.integrates) && raw.integrates.length ? raw.integrates : base.integrates,
  };
}

export function getResourceConfig(): ResourceConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<ResourceConfig>);
  } catch { /* 忽略损坏数据 */ }
  return normalize({});
}

export function saveResourceConfig(cfg: ResourceConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalize(cfg)));
  } catch {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: '资源参数保存失败，请检查浏览器存储' }));
  }
}

// 兼容旧签名读取：供 project.ts 等处直接使用
export function getProductCatalog(): CatalogProduct[] {
  return getResourceConfig().catalog;
}
export function getProductSystems(): string[] {
  return getResourceConfig().systems;
}
export function getProductIntegrates(): string[] {
  return getResourceConfig().integrates;
}