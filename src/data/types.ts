// 类型定义 —— 对应未来 PyQt6 桌面应用的数据结构

// 8 个标准项目阶段
export const PHASE_KEYS = [
  'initiate', // 立项
  'research', // 调研
  'solution', // 方案
  'dev', // 开发对接
  'deploy', // 部署记录
  'training', // 培训上线
  'trial', // 试运行
  'accept', // 验收
] as const;

export type PhaseKey = (typeof PHASE_KEYS)[number];

export interface PhaseMeta {
  key: PhaseKey;
  name: string;
  code: string; // 阶段编号 01-08
  color: string; // 甘特条颜色
}

export const PHASE_META: Record<PhaseKey, PhaseMeta> = {
  initiate: { key: 'initiate', name: '立项', code: '01', color: '#8FAADC' },
  research: { key: 'research', name: '调研', code: '02', color: '#A5B8DA' },
  solution: { key: 'solution', name: '方案', code: '03', color: '#7FB3D5' },
  dev: { key: 'dev', name: '开发对接', code: '04', color: '#5B9BD5' },
  deploy: { key: 'deploy', name: '部署记录', code: '05', color: '#4E89C4' },
  training: { key: 'training', name: '培训上线', code: '06', color: '#3D74A8' },
  trial: { key: 'trial', name: '试运行', code: '07', color: '#5E87B5' },
  accept: { key: 'accept', name: '验收', code: '08', color: '#4B7298' },
};

export type StageStatus = 'pending' | 'active' | 'done';

export interface Contact {
  party: '甲方' | '乙方';
  name: string;
  tel: string;
  // 乙方对接人角色：技术支持(蓝) / 销售(黄) / 开发(绿)
  role?: 'tech' | 'sales' | 'dev';
}

export const ROLE_META: Record<'tech' | 'sales' | 'dev' | 'pm', { label: string; color: string }> = {
  tech: { label: '技术支持', color: '#5B9BD5' },
  sales: { label: '销售', color: '#FFC000' },
  dev: { label: '开发', color: '#70AD47' },
  pm: { label: '项目经理', color: '#7952B3' },
};

/** 团队成员库 */
export interface TeamMember {
  id: string;
  name: string;
  roles: ('tech' | 'sales' | 'dev' | 'pm')[]; // 技术支持/销售/开发/项目经理
  tel: string;
  email: string;
  dept: string;
  note: string;
}

/** 项目等级 */
export type ProjectLevel = 'A' | 'B' | 'C';
export const LEVEL_META_PROJECT: Record<ProjectLevel, { color: string; bg: string }> = {
  A: { color: '#C00000', bg: '#FBEAEA' },
  B: { color: '#C77700', bg: '#FDF1DF' },
  C: { color: '#6B7A90', bg: '#EEF2F7' },
};

export interface ProjectStage {
  key: PhaseKey;
  planStart: string; // ISO 日期
  planEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: StageStatus;
  note?: string;
}

export type TaskStatus = 'todo' | 'doing' | 'done';

export interface ProjectTask {
  id: string;
  name: string;
  phase: PhaseKey;
  owner: string;
  start: string;
  end: string;
  status: TaskStatus;
  progress: number; // 0-100
  milestone?: boolean;
  priority?: 'high' | 'mid' | 'low';
}

export interface FileEntry {
  id: string;
  name: string;
  ext: string; // 文件后缀
  size: string;
  updated: string; // ISO 上传或覆盖时间戳（只读）
  data?: string; // dataURL / 对象存储 URL，存在则支持下载
}

export interface TemplateDoc {
  id: string;
  name: string;
  category: string; // 模板类型（立项类/方案类…）
  desc: string;
  fields: string[]; // 自动填充的字段名
  content?: string; // Word 正文（多行纯文本，含 {字段} 占位符，旧版兼容）
  contentHTML?: string; // 富文本正文（HTML，含 <span class="tpl-ph"> 占位符）
  updatedAt?: string; // 最后修改时间 ISO
  isDefault?: boolean; // 是否默认模板
  builtin?: boolean; // 是否预置模板（不可删除）
}

/** 电子签名 */
export interface Signature {
  id: string;
  name: string; // 签名名称，如「张启凡」
  dataURL: string; // PNG / SVG data URL（透明底）
  createdAt: string;
  isDefault?: boolean;
}

/** 工时记录（工时统计插件） */
export interface TimeRecord {
  id: string;
  projectId: string;
  phaseKey?: string; // 关联阶段
  taskName: string; // 任务/事项
  worker: string; // 人员
  date: string; // 记录日期 YYYY-MM-DD
  hours: number; // 投入小时
  note?: string; // 说明
}

export interface Reminder {
  targetName: string;
  projectId: string;
  type: 'deadline' | 'stage';
  date: string; // 到期日
  level: 'overdue' | 'urgent' | 'warning'; // 逾期 / 1天 / 3天
}

export interface Project {
  id: string;
  code: string; // 项目编号
  name: string;
  customer: string; // 客户
  category: string; // 所属行业/业务条线
  manager: string; // 我方负责人
  contacts: { a: Contact; b: Contact };
  startDate: string;
  endDate: string;
  progress: number;
  planStart: string;
  planEnd: string;
  stages: ProjectStage[];
  tasks: ProjectTask[];
  filesDir: Record<string, Record<string, FileEntry[]>>; // stage -> folder -> files
  priority: 'normal' | 'high' | 'urgent';
  budget: string;
  remark?: string;
  level?: ProjectLevel; // 项目等级 A/B/C
  thirdParty?: 'yes' | 'no'; // 是否对接三方系统
  deliverables?: string; // 交付物清单
  contract?: {
    no: string;
    name: string;
    amount: string;
    signDate: string;
    payment?: string;
    files?: { name: string; size: number; uploadedAt: string; data?: string }[];
  };
  logs?: { time: string; action: string }[]; // 操作日志
  /** 甲方联系人（不纳入团队成员库，独立维护，可多人） */
  clients?: { id: string; name: string; tel: string }[];
  /** 我方成员快照（按角色），取自团队成员库 */
  teamOf?: Record<'tech' | 'sales' | 'dev', { id: string; name: string; tel: string }[]>;
  /** 产品/设备明细（产品详情·仅硬件） */
  products?: ProductItem[];
  /** 对接系统列表（产品详情） */
  systems?: ProjectSystemItem[];
  /** 集成平台列表（产品详情） */
  integrates?: ProjectIntegrateItem[];
}

/** 产品/设备明细项（产品详情·仅硬件：设备名+规格+数量） */
export interface ProductItem {
  id: string;
  /** 产品/设备名称 */
  name: string;
  /** 规格/型号与单位 */
  spec: string;
  /** 数量 */
  qty: string;
}

/** 对接系统项（产品详情） */
export interface ProjectSystemItem {
  id: string;
  /** 系统名称（如：印章管控平台 / 指纹一体机管理平台） */
  name: string;
  /** 版本号（如：2.0 / 3.01） */
  version: string;
}

/** 集成平台项（产品详情） */
export interface ProjectIntegrateItem {
  id: string;
  /** 集成平台名称（如：OA系统 / 企业微信 / 钉钉） */
  name: string;
  /** 对接目标（如：泛微OA） */
  target: string;
}

/** 产品/设备明细项（产品详情） */
export interface ProductItem {
  id: string;
  /** 产品/设备名称 */
  name: string;
  /** 规格/型号 */
  spec: string;
  /** 数量 */
  qty: string;
}