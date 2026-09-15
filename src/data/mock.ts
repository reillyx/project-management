import type {
  Project,
  ProjectStage,
  ProjectTask,
  FileEntry,
  TemplateDoc,
  TeamMember,
} from './types';
import { PHASE_KEYS, type PhaseKey, type StageStatus } from './types';
import { addDays, todayISO } from '../lib';

/** 团队成员库（可指派到任意项目） */
export const TEAM: TeamMember[] = [
  { id: 't1', name: '李源', roles: ['tech'], tel: '13800000001', email: 'liyuan@corp.com', dept: '技术部', note: '擅长网络/门禁实施' },
  { id: 't2', name: '郑云飞', roles: ['sales'], tel: '13800000002', email: 'zheng@corp.com', dept: '销售部', note: '区域销售' },
  { id: 't3', name: '汪洋', roles: ['dev'], tel: '13800000003', email: 'wangyang@corp.com', dept: '研发部', note: '二开与接口开发' },
  { id: 't4', name: '陈婷', roles: ['tech', 'dev'], tel: '13800000004', email: 'chenting@corp.com', dept: '技术部', note: '现场实施+二次开发' },
  { id: 't5', name: '张启凡', roles: ['pm'], tel: '13900000005', email: 'pm.zhang@corp.com', dept: '项目管理部', note: '项目经理（本机用户）' },
  { id: 't6', name: '王芳', roles: ['sales', 'pm'], tel: '13800000006', email: 'wangfang@corp.com', dept: '销售部', note: '' },
];

// 每阶段默认工期（天）
const PHASE_DAYS: Record<PhaseKey, number> = {
  initiate: 7,
  research: 15,
  solution: 10,
  dev: 30,
  deploy: 5,
  training: 4,
  trial: 20,
  accept: 5,
};

interface StageSeed {
  key: PhaseKey;
  status: StageStatus;
}

/** 根据阶段种子生成阶段数组（计划时间顺延） */
function buildStages(seeds: StageSeed[], anchor: string): ProjectStage[] {
  let cursor = anchor;
  return seeds.map(s => {
    const planStart = cursor;
    const planEnd = addDays(planStart, PHASE_DAYS[s.key] - 1);
    cursor = addDays(planEnd, 1);
    const stage: ProjectStage = {
      key: s.key,
      planStart,
      planEnd,
      status: s.status,
    };
    if (s.status === 'done') {
      stage.actualStart = planStart;
      stage.actualEnd = addDays(planStart, Math.max(1, PHASE_DAYS[s.key] - 2));
    } else if (s.status === 'active') {
      stage.actualStart = planStart;
    }
    return stage;
  });
}

const TASK_TEMPLATES: Record<PhaseKey, { name: string; days: number }[]> = {
  initiate: [
    { name: '现场勘察与需求采集', days: 3 },
    { name: '初步方案立项评审', days: 2 },
    { name: '签订项目任务书', days: 2 },
  ],
  research: [
    { name: '原系统资料收集', days: 5 },
    { name: '业务流程梳理', days: 5 },
    { name: '需求范围确认', days: 5 },
  ],
  solution: [
    { name: '整体方案设计', days: 4 },
    { name: '点位清单与设备选型', days: 3 },
    { name: '方案评审与修订', days: 3 },
  ],
  dev: [
    { name: '硬件到货与盘点', days: 5 },
    { name: '平台接口开发', days: 12 },
    { name: '现场设备安装调试', days: 10 },
    { name: '联调联试', days: 6 },
  ],
  deploy: [
    { name: '生产环境部署', days: 3 },
    { name: '配置与数据初始化', days: 2 },
  ],
  training: [
    { name: '操作手册编写', days: 2 },
    { name: '分批用户培训', days: 2 },
  ],
  trial: [
    { name: '试运行监控', days: 15 },
    { name: '问题收集与修复', days: 10 },
  ],
  accept: [
    { name: '验收材料整理', days: 3 },
    { name: '正式验收评审', days: 2 },
  ],
};

function buildTasks(stages: ProjectStage[]): ProjectTask[] {
  const tasks: ProjectTask[] = [];
  stages.forEach((st, i) => {
    const tpl = TASK_TEMPLATES[st.key] ?? [];
    tpl.forEach((t, j) => {
      const start = addDays(st.planStart, j === 0 ? 0 : j);
      const status: ProjectTask['status'] =
        st.status === 'done' ? 'done' : st.status === 'active' && j <= 1 ? 'doing' : 'todo';
      const progress =
        status === 'done' ? 100 : status === 'doing' ? (j === 0 ? 60 : 20) : 0;
      tasks.push({
        id: `${st.key}-${i}-${j}`,
        name: t.name,
        phase: st.key,
        owner: st.key === 'dev' || st.key === 'deploy'
          ? (TEAM.find(member => member.roles.includes('dev'))?.name || '')
          : (TEAM.find(member => member.roles.includes('tech'))?.name || ''),
        start,
        end: addDays(start, Math.max(1, t.days - 1)),
        status,
        progress,
        milestone: j === tpl.length - 1,
      });
    });
  });
  return tasks;
}

// 文件目录模板：阶段 -> 用途目录
export const USAGE_DIRS: Record<PhaseKey, string[]> = {
  initiate: ['立项材料', '会议纪要', '需求文档'],
  research: ['调研资料', '需求确认'],
  solution: ['方案文档', '点位清单', '评审记录'],
  dev: ['接口文档', '测试报告', '实施记录', '设备台账'],
  deploy: ['部署记录', '配置清单'],
  training: ['培训材料', '操作手册'],
  trial: ['试运行报告', '问题记录'],
  accept: ['验收资料', '竣工文档'],
};

const FILE_SCHEMAS: Record<PhaseKey, { folder: string; file: string; ext: string }[]> = {
  initiate: [
    { folder: '立项材料', file: '项目立项申请', ext: 'docx' },
    { folder: '会议纪要', file: '启动会会议纪要', ext: 'docx' },
    { folder: '需求文档', file: '需求规格说明书', ext: 'docx' },
  ],
  research: [
    { folder: '调研资料', file: '现场调研记录', ext: 'docx' },
    { folder: '需求确认', file: '需求确认单', ext: 'xlsx' },
  ],
  solution: [
    { folder: '方案文档', file: '系统建设方案', ext: 'docx' },
    { folder: '点位清单', file: '点位与设备清单', ext: 'xlsx' },
  ],
  dev: [
    { folder: '接口文档', file: '平台接口说明', ext: 'docx' },
    { folder: '测试报告', file: '功能测试报告', ext: 'docx' },
    { folder: '实施记录', file: '设备安装调试记录', ext: 'xlsx' },
  ],
  deploy: [
    { folder: '部署记录', file: '现场部署记录', ext: 'docx' },
    { folder: '配置清单', file: '系统配置清单', ext: 'xlsx' },
  ],
  training: [
    { folder: '培训材料', file: '用户培训手册', ext: 'docx' },
  ],
  trial: [
    { folder: '试运行报告', file: '试运行情况说明', ext: 'docx' },
  ],
  accept: [
    { folder: '验收资料', file: '项目验收单', ext: 'docx' },
    { folder: '竣工文档', file: '竣工资料', ext: 'docx' },
  ],
};

function fileSize(ext: string): string {
  const sizes = ['128KB', '2.4MB', '860KB', '1.1MB', '356KB', '4.2MB'];
  return sizes[Math.floor(Math.random() * sizes.length) % sizes.length] + (ext === 'docx' ? '' : '');
}

function fileFor(p: Project, i: number, fileName: string, ext: string, folder: string): FileEntry {
  return {
    id: `${p.id}-f${i}`,
    name: fileName,
    ext,
    size: `${Math.floor(80 + Math.random() * 4000)}KB`.replace('KB', ext === 'docx' ? 'KB' : 'KB'),
    updated: addDays(p.startDate, -(Math.floor(Math.random() * 30))),
  };
}

function buildFilesDir(p: Project): Record<string, Record<string, FileEntry[]>> {
  const dir: Record<string, Record<string, FileEntry[]>> = {};
  PHASE_KEYS.forEach(k => {
    const folders = USAGE_DIRS[k];
    dir[k] = {};
    const schemas = FILE_SCHEMAS[k] ?? [];
    // 早于当前推进阶段的阶段放文件，其余留空目录
    for (const folder of folders) {
      dir[k][folder] = [];
      const matched = schemas.filter(s => s.folder === folder);
      matched.forEach((s, j) => {
        dir[k][folder].push(
          fileFor({ ...p, id: `${p.id}-${k}-${folder}-${j}` }, j, s.file, s.ext, s.folder),
        );
      });
    }
  });
  return dir;
}

interface SeedDef {
  code: string;
  name: string;
  customer: string;
  category: string;
  manager: string;
  aName: string;
  aTel: string;
  bName: string;
  bTel: string;
  bRole: Project['contacts']['b']['role'];
  budget: string;
  priority: Project['priority'];
  stages: StageSeed[];
  remark?: string;
  level?: Project['level'];
  thirdParty?: Project['thirdParty'];
  deliverables?: string;
  contract?: Project['contract'];
  logs?: Project['logs'];
}

function h(seed: SeedDef, i: number, base: string): Project {
  const stages = buildStages(seed.stages, base);
  const tasks = buildTasks(stages);
  const planStart = stages[0].planStart;
  const planEnd = stages[stages.length - 1].planEnd;
  let done = 0;
  stages.forEach(s => {
    if (s.status === 'done') done++;
  });
  const progress = Math.round((done / PHASE_KEYS.length) * 100);
  const pick = (...ids: string[]): { id: string; name: string; tel: string }[] =>
    ids.flatMap(mid => {
      const m = TEAM.find(t => t.id === mid);
      return m ? [{ id: m.id, name: m.name, tel: m.tel }] : [];
    });
  const p: Project = {
    id: `p${i}`,
    code: seed.code,
    name: seed.name,
    customer: seed.customer,
    category: seed.category,
    manager: seed.manager,
    contacts: {
      a: { party: '甲方', name: seed.aName, tel: seed.aTel },
      b: { party: '乙方', name: seed.bName, tel: seed.bTel, role: seed.bRole },
    },
    clients: [{ id: 'clt1', name: seed.aName, tel: seed.aTel }],
    teamOf: { tech: pick('t1', 't4'), sales: pick('t2', 't6'), dev: pick('t3', 't4') },
    startDate: planStart,
    endDate: planEnd,
    progress,
    planStart,
    planEnd,
    stages,
    tasks,
    filesDir: {},
    priority: seed.priority,
    budget: seed.budget,
    remark: seed.remark,
    level: seed.level,
    thirdParty: seed.thirdParty,
    deliverables: seed.deliverables,
    contract: seed.contract,
    logs: seed.logs,
  };
  p.filesDir = buildFilesDir(p);
  return p;
}

export const PROJECTS: Project[] = [
  h(
    {
      code: 'IT-2026-001',
      name: '智慧城市视频监控二期扩容项目',
      customer: '市公共安全信息化中心',
      category: '智慧城市',
      manager: '张伟',
      aName: '王建军',
      aTel: '138-0013-8001',
      bName: '刘洋',
      bTel: '139-0102-5566',
      bRole: 'tech',
      budget: '2680000',
      priority: 'high',
      stages: [
        { key: 'initiate', status: 'done' },
        { key: 'research', status: 'done' },
        { key: 'solution', status: 'done' },
        { key: 'dev', status: 'active' },
        { key: 'deploy', status: 'pending' },
        { key: 'training', status: 'pending' },
        { key: 'trial', status: 'pending' },
        { key: 'accept', status: 'pending' },
      ],
      remark: '重点项目，涉及 320 个新增监控点位与 5 路平台对接。',
      level: 'A',
      thirdParty: 'yes',
      deliverables: '320 台高清摄像机、5 路平台对接服务、1 套存储阵列及网桥',
      contract: {
        no: 'HT-2026-0118',
        name: '智慧城市视频监控二期扩容项目合同',
        amount: '2680000',
        signDate: todayISO(-6),
        payment: '预付款 30% / 到货款 40% / 验收款 25% / 质保金 5%',
      },
      logs: [
        { time: todayISO(-6), action: '创建项目并关联合同 HT-2026-0118' },
        { time: todayISO(-4), action: '调研完成，形成需求确认清单' },
        { time: todayISO(-2), action: '方案评审通过，进入开发对接' },
      ],
    },
    1,
    todayISO(-6),
  ),
  h(
    {
      code: 'IT-2026-002',
      name: '数据中心机房改造升级项目',
      customer: '某集团信息科技部',
      category: '基础设施',
      manager: '李强',
      aName: '陈志远',
      aTel: '137-0055-6120',
      bName: '赵敏',
      bTel: '136-1122-3344',
      bRole: 'dev',
      budget: '1530000',
      priority: 'normal',
      stages: [
        { key: 'initiate', status: 'done' },
        { key: 'research', status: 'done' },
        { key: 'solution', status: 'done' },
        { key: 'dev', status: 'active' },
        { key: 'deploy', status: 'pending' },
        { key: 'training', status: 'pending' },
        { key: 'trial', status: 'pending' },
        { key: 'accept', status: 'pending' },
      ],
      level: 'B',
      thirdParty: 'no',
      deliverables: '机房基础改造、UPS 配电系统、动环监控系统部署',
      contract: {
        no: 'HT-2026-0032',
        name: '数据中心机房改造升级项目合同',
        amount: '1530000',
        signDate: todayISO(-20),
        payment: '预付款 40% / 验收款 55% / 质保金 5%',
      },
      logs: [
        { time: todayISO(-20), action: '创建项目并关联合同 HT-2026-0032' },
        { time: todayISO(-8), action: '巡检现场，完成现状摸底' },
      ],
    },
    2,
    todayISO(-20),
  ),
  h(
    {
      code: 'IT-2026-003',
      name: '园区一体机门禁考勤系统上线',
      customer: 'XX 高新产业园区管委会',
      category: '智慧园区',
      manager: '王芳',
      aName: '孙丽华',
      aTel: '135-0099-1823',
      bName: '周建国',
      bTel: '138-2233-8899',
      bRole: 'sales',
      budget: '860000',
      priority: 'urgent',
      stages: [
        { key: 'initiate', status: 'done' },
        { key: 'research', status: 'done' },
        { key: 'solution', status: 'done' },
        { key: 'dev', status: 'done' },
        { key: 'deploy', status: 'done' },
        { key: 'training', status: 'active' },
        { key: 'trial', status: 'pending' },
        { key: 'accept', status: 'pending' },
      ],
      remark: '上线临近，培训与试运行窗口紧张，需重点关注。',
      level: 'A',
      thirdParty: 'no',
      deliverables: '48 台一体机门禁、考勤系统软件授权、现场调试',
      contract: {
        no: 'HT-2026-0096',
        name: '园区一体机门禁考勤系统采购与服务合同',
        amount: '860000',
        signDate: todayISO(-42),
        payment: '预付款 50% / 验收款 50%',
      },
      logs: [
        { time: todayISO(-42), action: '创建项目并关联合同 HT-2026-0096' },
        { time: todayISO(-10), action: '部署完成，进入培训上线' },
      ],
    },
    3,
    todayISO(-42),
  ),
  h(
    {
      code: 'IT-2026-004',
      name: '城区银行网点安防联网工程',
      customer: '省农商银行安全保卫部',
      category: '金融安防',
      manager: '陈刚',
      aName: '吴主任',
      aTel: '139-0717-4028',
      bName: '杨帆',
      bTel: '136-3344-5566',
      bRole: 'tech',
      budget: '4120000',
      priority: 'high',
      stages: [
        { key: 'initiate', status: 'done' },
        { key: 'research', status: 'active' },
        { key: 'solution', status: 'pending' },
        { key: 'dev', status: 'pending' },
        { key: 'deploy', status: 'pending' },
        { key: 'training', status: 'pending' },
        { key: 'trial', status: 'pending' },
        { key: 'accept', status: 'pending' },
      ],
      remark: '对接银行内网 OA 与安保平台，需多次进场勘察。',
      level: 'A',
      thirdParty: 'yes',
      deliverables: '12 家网点安防设备供货与联网调试、监控中心大屏对接',
      contract: {
        no: 'HT-2026-0207',
        name: '城区银行网点安防联网工程合同',
        amount: '4120000',
        signDate: todayISO(-1),
        payment: '按项目里程碑分期支付',
      },
      logs: [
        { time: todayISO(-1), action: '创建项目并关联合同 HT-2026-0207' },
      ],
    },
    4,
    todayISO(-1),
  ),
  h(
    {
      code: 'IT-2025-088',
      name: '大型商超客流统计与分析平台',
      customer: '连锁商业集团数字化部',
      category: '商业分析',
      manager: '刘敏',
      aName: '何总',
      aTel: '136-0058-7743',
      bName: '郑晓',
      bTel: '139-5566-7788',
      bRole: 'dev',
      budget: '960000',
      priority: 'high',
      stages: [
        { key: 'initiate', status: 'done' },
        { key: 'research', status: 'done' },
        { key: 'solution', status: 'done' },
        { key: 'dev', status: 'done' },
        { key: 'deploy', status: 'done' },
        { key: 'training', status: 'done' },
        { key: 'trial', status: 'active' },
        { key: 'accept', status: 'pending' },
      ],
      remark: '验收临近，存在逾期风险，需加速试运行收尾。',
      level: 'B',
      thirdParty: 'yes',
      deliverables: '客流统计平台软件、前端大屏、会员系统数据对接',
      contract: {
        no: 'HT-2025-0777',
        name: '商超客流统计与分析平台建设合同',
        amount: '960000',
        signDate: todayISO(-75),
        payment: '预付款 30% / 上线款 50% / 验收款 20%',
      },
      logs: [
        { time: todayISO(-75), action: '创建项目并关联合同 HT-2025-0777' },
        { time: todayISO(-30), action: '平台正式上线，进入试运行' },
        { time: todayISO(-3), action: '试运行问题清单整理，推进验收' },
      ],
    },
    5,
    todayISO(-75),
  ),
];

// 文档模板库
const ph = (name: string): string =>
  `<span class="tpl-ph" contenteditable="false" data-field="${name}">{${name}}</span>`;

export const TEMPLATES: TemplateDoc[] = [
  {
    id: 't1',
    name: '项目计划书',
    category: '立项类',
    desc: '覆盖项目背景、目标、范围、里程碑、资源与风险管理。',
    fields: ['项目名称', '客户', '项目经理', '计划起止时间', '预算', '需求范围'],
    content: [
      '{项目名称}项目计划书',
      '',
      '一、项目背景',
      '客户：{客户}    项目经理：{项目经理}',
      '',
      '二、项目目标与范围',
      '{需求范围}',
      '',
      '三、计划周期',
      '{计划起止时间}',
      '',
      '四、预算',
      '{预算}',
      '',
      '五、里程碑与交付',
      '项目于{计划起止时间}内完成交付，分阶段开展调研、方案、开发对接、部署上线与验收归档。',
      '',
      '六、风险与保障',
      '由项目经理{项目经理}统筹，技术支持与开发团队协同推进，定期评审进度与风险。',
    ].join('\n'),
  },
  {
    id: 't2',
    name: '验收单',
    category: '验收类',
    desc: '验收范围、标准、结论与双方签字确认。',
    fields: ['项目名称', '客户', '项目经理', '验收日期', '验收结论'],
    content: [
      '{项目名称}项目验收单',
      '',
      '一、验收基本信息',
      '客户：{客户}    项目经理：{项目经理}',
      '',
      '二、验收范围与标准',
      '依据合同约定与验收标准，对项目交付物、功能与文档进行核验。',
      '',
      '三、验收结论',
      '{验收结论}',
      '',
      '四、签字确认',
      '甲方（客户）签字：____________   日期：{验收日期}',
      '乙方（承建方）签字：____________   日期：{验收日期}',
    ].join('\n'),
  },
  {
    id: 't3',
    name: '会议纪要',
    category: '会议纪要',
    desc: '记录会议主题、参会人、议题、决定事项与行动计划。',
    fields: ['项目名称', '会议主题', '参会人', '会议日期', '决定事项'],
    content: [
      '{项目名称}会议纪要',
      '',
      '会议主题：{会议主题}',
      '会议日期：{会议日期}',
      '参会人：{参会人}',
      '',
      '一、会议议题',
      '{会议主题}相关进展汇报与问题协同。',
      '',
      '二、决定事项',
      '{决定事项}',
      '',
      '三、后续行动',
      '各责任方在{会议日期}后推进落实，下次会议做进展回顾。',
    ].join('\n'),
  },
  {
    id: 't4',
    name: '调研确认表',
    category: '需求类',
    desc: '调研项、调研结论与客户确认。',
    fields: ['项目名称', '客户', '调研人', '调研日期', '调研项', '确认结论'],
    content: [
      '{项目名称}调研确认表',
      '',
      '客户：{客户}    调研人：{调研人}',
      '调研日期：{调研日期}',
      '',
      '一、调研项',
      '{调研项}',
      '',
      '二、确认结论',
      '{确认结论}',
      '',
      '客户确认签字：____________',
    ].join('\n'),
  },
  {
    id: 't5',
    name: '实施方案',
    category: '方案类',
    desc: '实施方案、步骤、时间节点与人员分工。',
    fields: ['项目名称', '客户', '项目管理阶段', '计划起止时间', '方案编制人'],
    content: [
      '{项目名称}实施方案',
      '',
      '一、总体思路',
      '结合{项目管理阶段}阶段要求，围绕业务需求开展方案设计与实施。',
      '',
      '二、实施步骤',
      '1. 环境与资料准备',
      '2. 部署与配置',
      '3. 联调与验证',
      '',
      '三、时间节点',
      '{计划起止时间}',
      '',
      '四、人员分工',
      '{方案编制人}统筹实施，技术支持与开发团队协同完成。',
    ].join('\n'),
  },
  {
    id: 't6',
    name: '培训签到表',
    category: '培训类',
    desc: '培训主题、时间、讲师与参训人签到。',
    fields: ['项目名称', '培训主题', '讲师', '培训日期'],
    content: [
      '{项目名称}培训签到表',
      '',
      '培训主题：{培训主题}',
      '讲师：{讲师}    培训日期：{培训日期}',
      '',
      '参训人员签到：',
      '1. ____________    2. ____________    3. ____________',
      '4. ____________    5. ____________    6. ____________',
      '',
      '培训效果反馈：',
      '________________________________________',
    ].join('\n'),
  },
  {
    id: 't7',
    name: '试运行报告',
    category: '试运行类',
    desc: '试运行周期、问题记录、运行情况与结论。',
    fields: ['项目名称', '客户', '试运行周期', '问题记录', '运行情况'],
    content: [
      '{项目名称}试运行报告',
      '',
      '客户：{客户}',
      '试运行周期：{试运行周期}',
      '',
      '一、运行情况',
      '{运行情况}',
      '',
      '二、问题记录与处理',
      '{问题记录}',
      '',
      '三、结论与建议',
      '试运行期间系统运行稳定，主要问题已闭环，具备正式验收条件。',
    ].join('\n'),
  },
  {
    id: 't8',
    name: '上线通知',
    category: '上线类',
    desc: '通知客户系统正式上线时间、切换安排与注意事项。',
    fields: ['项目名称', '客户', '上线时间', '切换安排'],
    content: [
      '关于{项目名称}正式上线的通知',
      '',
      '尊敬的{客户}：',
      '',
      '经双方联调与验证，{项目名称}定于{上线时间}正式上线，现将相关安排通知如下：',
      '',
      '一、上线时间',
      '{上线时间}',
      '',
      '二、切换安排',
      '{切换安排}',
      '',
      '三、注意事项',
      '上线期间如遇问题，请及时联系项目组，我方将第一时间响应处理。',
      '',
      '特此通知。',
    ].join('\n'),
  },
  {
    id: 't9',
    name: '需求变更单',
    category: '变更类',
    desc: '记录需求变更内容、影响评估与确认签字。',
    fields: ['项目名称', '客户', '变更内容', '影响评估'],
    content: [
      '{项目名称}需求变更单',
      '',
      '客户：{客户}',
      '',
      '一、变更内容',
      '{变更内容}',
      '',
      '二、影响评估',
      '{影响评估}',
      '',
      '三、变更确认',
      '甲方（客户）确认：____________',
      '乙方（承建方）确认：____________',
    ].join('\n'),
  },
  {
    id: 't10',
    name: '项目周报',
    category: '汇报类',
    desc: '本周进展、下周计划、风险项与需要协调事项。',
    fields: ['项目名称', '项目经理', '本周进展', '下周计划', '风险项'],
    content: [
      '{项目名称}项目周报',
      '',
      '项目经理：{项目经理}',
      '',
      '一、本周进展',
      '{本周进展}',
      '',
      '二、下周计划',
      '{下周计划}',
      '',
      '三、风险与问题',
      '{风险项}',
      '',
      '四、需协调事项',
      '请各相关方及时反馈，确保项目按计划推进。',
    ].join('\n'),
  },
];

/** 预置模板的富文本正文（Word 排版）+ 标准字段；覆盖默认 content，供在线编辑与生成使用 */
const RICH_TPL: Record<string, { fields: string[]; isDefault?: boolean; html: string }> = {
  t1: {
    fields: ['项目名称', '甲方名称', '合同编号', '金额', '项目经理', '技术支持', '销售', '计划开始', '交付日期'],
    isDefault: true,
    html: `
<h1>${ph('项目名称')}项目计划书</h1>
<p style="text-align:center;color:#8A97A8">项目编号：${ph('项目编号')}&nbsp;合同编号：${ph('合同编号')}</p>
<h2>一、项目基本信息</h2>
<table>
<tr><th style="width:26%">项目名称</th><td>${ph('项目名称')}</td></tr>
<tr><th>甲方（客户）</th><td>${ph('甲方名称')}</td></tr>
<tr><th>合同金额</th><td>${ph('金额')}</td></tr>
<tr><th>计划周期</th><td>${ph('计划开始')} 至 ${ph('交付日期')}</td></tr>
<tr><th>项目经理</th><td>${ph('项目经理')}</td></tr>
</table>
<h2>二、项目背景与目标</h2>
<p>本项目面向 ${ph('甲方名称')} 的实际业务需求，提供系统集成与实施服务。项目目标是按期、保质完成系统建设并顺利通过验收。</p>
<h2>三、实施范围</h2>
<p>项目按调研立项、需求分析、开发对接、部署培训、试运行、验收归档等阶段推进，覆盖现场实施、二次开发与联调测试。</p>
<h2>四、组织分工</h2>
<ul><li>项目经理：${ph('项目经理')}（总体统筹）</li><li>技术支持：${ph('技术支持')}</li><li>销售对接：${ph('销售')}</li></ul>
<h2>五、里程碑与风险保障</h2>
<p>项目于 ${ph('计划开始')} 启动，计划 ${ph('交付日期')} 前完成交付。建立周例会与风险台账机制，由项目经理统筹，技术与开发团队协同保障进度与质量。</p>`,
  },
  t2: {
    fields: ['项目名称', '甲方名称', '项目经理', '交付日期', '当前日期'],
    html: `
<h1>${ph('项目名称')}项目验收单</h1>
<table>
<tr><th style="width:26%">项目名称</th><td>${ph('项目名称')}</td></tr>
<tr><th>甲方（客户）</th><td>${ph('甲方名称')}</td></tr>
<tr><th>项目经理</th><td>${ph('项目经理')}</td></tr>
<tr><th>验收日期</th><td>${ph('交付日期')}</td></tr>
</table>
<h2>一、验收范围与标准</h2>
<p>依据合同约定及相关技术标准，对项目交付的软硬件、系统功能、文档资料进行逐项核验，确认满足上线运行要求。</p>
<h2>二、验收结论</h2>
<p>经双方共同验收，本项目交付物齐全、功能运行正常、文档完备，<b>同意通过验收</b>。</p>
<h2>三、签字确认</h2>
<table>
<tr><th>甲方（客户）</th><th>乙方（承建方）</th></tr>
<tr><td style="height:64px">签字（盖章）：<br/>甲方签名：____________<br/>日期：${ph('交付日期')}</td><td style="height:64px">签字（盖章）：<br/>${ph('签名')}<br/>日期：${ph('当前日期')}</td></tr>
</table>`,
  },
  t3: {
    fields: ['项目名称', '当前日期', '项目经理', '技术支持'],
    html: `
<h1>${ph('项目名称')}会议纪要</h1>
<p>会议时间：${ph('当前日期')}&nbsp;&nbsp;主持人：${ph('项目经理')}</p>
<p>参会人员：${ph('项目经理')}、${ph('技术支持')}、甲方相关负责人</p>
<h2>一、会议议题</h2>
<ol><li>项目当前进展汇报</li><li>现场问题与需求协同</li><li>下一阶段工作安排</li></ol>
<h2>二、会议内容</h2>
<p>会上通报了 ${ph('项目名称')} 各阶段完成情况，对当前存在的问题进行了梳理，并明确责任人和完成时限。</p>
<h2>三、决定事项与行动计划</h2>
<table>
<tr><th style="width:44%">事项</th><th style="width:24%">责任人</th><th>完成时间</th></tr>
<tr><td>完成现场设备调试</td><td>${ph('技术支持')}</td><td>会前确认</td></tr>
<tr><td>输出问题整改清单</td><td>${ph('项目经理')}</td><td>会后 3 日</td></tr>
</table>`,
  },
  t4: {
    fields: ['项目名称', '甲方名称', '项目经理', '当前日期', '技术支持'],
    html: `
<h1>${ph('项目名称')}调研确认表</h1>
<table>
<tr><th style="width:26%">客户单位</th><td>${ph('甲方名称')}</td></tr>
<tr><th>调研人</th><td>${ph('技术支持')}</td></tr>
<tr><th>调研日期</th><td>${ph('当前日期')}</td></tr>
</table>
<h2>一、调研项</h2>
<table>
<tr><th style="width:34%">调研内容</th><th>调研结论 / 现状说明</th></tr>
<tr><td>业务流程与使用场景</td><td>待现场确认填写</td></tr>
<tr><td>现有系统与对接环境</td><td>待现场确认填写</td></tr>
<tr><td>网络与点位条件</td><td>待现场确认填写</td></tr>
</table>
<h2>二、确认结论</h2>
<p>以上调研内容经双方核对无误，作为后续方案设计与实施依据。</p>
<p>客户确认签字：____________&nbsp;&nbsp;日期：${ph('当前日期')}</p>`,
  },
  t5: {
    fields: ['项目名称', '甲方名称', '项目经理', '技术支持', '开发', '计划开始', '交付日期'],
    html: `
<h1>${ph('项目名称')}实施方案</h1>
<h2>一、总体思路</h2>
<p>结合 ${ph('甲方名称')} 的业务需求，围绕 ${ph('项目名称')} 建设目标，按"环境准备—部署配置—联调验证—上线培训"的路径组织实施，确保 ${ph('交付日期')} 前交付。</p>
<h2>二、实施步骤</h2>
<ol>
<li><b>环境与资料准备</b>：完成现场勘察、网络与设备条件确认。</li>
<li><b>部署与配置</b>：由 ${ph('技术支持')} 完成平台安装、点位配置与数据初始化。</li>
<li><b>接口与二次开发</b>：由 ${ph('开发')} 完成平台对接与定制功能开发。</li>
<li><b>联调与验证</b>：全流程联调测试，修复遗留问题。</li>
</ol>
<h2>三、时间节点</h2>
<table>
<tr><th>阶段</th><th>计划开始</th><th>计划完成</th></tr>
<tr><td>整体实施</td><td>${ph('计划开始')}</td><td>${ph('交付日期')}</td></tr>
</table>
<h2>四、人员分工</h2>
<p>项目经理 ${ph('项目经理')} 统筹实施；技术支持 ${ph('技术支持')} 负责现场部署；开发 ${ph('开发')} 负责接口与二开。</p>`,
  },
  t6: {
    fields: ['项目名称', '甲方名称', '项目经理', '当前日期'],
    html: `
<h1>${ph('项目名称')}培训签到表</h1>
<p>培训主题：系统操作与日常运维培训</p>
<p>培训单位：${ph('甲方名称')}&nbsp;&nbsp;讲师：${ph('项目经理')}&nbsp;&nbsp;培训日期：${ph('当前日期')}</p>
<h2>一、参训人员签到</h2>
<table>
<tr><th style="width:8%">序号</th><th style="width:30%">姓名</th><th style="width:32%">部门 / 岗位</th><th>签字</th></tr>
${[1, 2, 3, 4, 5, 6].map(n => `<tr><td>${n}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`).join('')}
</table>
<h2>二、培训内容</h2>
<ul><li>系统功能与操作流程介绍</li><li>日常使用与常见问题处理</li><li>运维注意事项与联系方式</li></ul>`,
  },
  t7: {
    fields: ['项目名称', '甲方名称', '计划开始', '交付日期', '项目经理'],
    html: `
<h1>${ph('项目名称')}试运行报告</h1>
<table>
<tr><th style="width:26%">客户单位</th><td>${ph('甲方名称')}</td></tr>
<tr><th>试运行周期</th><td>${ph('计划开始')} 至 ${ph('交付日期')}</td></tr>
<tr><th>负责人</th><td>${ph('项目经理')}</td></tr>
</table>
<h2>一、运行情况</h2>
<p>试运行期间系统整体运行稳定，核心业务功能正常，数据采集与展示准确，满足日常使用要求。</p>
<h2>二、问题记录与处理</h2>
<table>
<tr><th style="width:40%">问题描述</th><th style="width:22%">处理状态</th><th>备注</th></tr>
<tr><td>试运行反馈问题</td><td>已闭环</td><td>详见问题台账</td></tr>
</table>
<h2>三、结论与建议</h2>
<p>试运行期间主要问题均已处理完毕，系统具备正式上线及验收条件，建议转入正式验收。</p>`,
  },
  t8: {
    fields: ['项目名称', '甲方名称', '交付日期', '项目经理', '技术支持'],
    html: `
<h1>关于${ph('项目名称')}正式上线的通知</h1>
<p>尊敬的 ${ph('甲方名称')}：</p>
<p>经双方联调与验证，<b>${ph('项目名称')}</b> 定于 ${ph('交付日期')} 正式上线投入使用，现将相关安排通知如下：</p>
<h2>一、上线时间</h2>
<p>系统定于 ${ph('交付日期')} 正式上线。</p>
<h2>二、切换安排</h2>
<ol><li>上线前完成数据核对与最终配置确认；</li><li>上线当日由 ${ph('技术支持')} 现场保障，${ph('项目经理')} 全程跟进；</li><li>切换后进入运行观察期。</li></ol>
<h2>三、注意事项</h2>
<p>上线期间如遇问题，请及时联系项目组，我方将第一时间响应处理。</p>
<p style="text-align:right;margin-top:24px">项目组<br/>${ph('签名')}<br/><span style="color:#9AA7B8;font-size:10pt">${ph('当前日期')}</span></p>`,
  },
  t9: {
    fields: ['项目名称', '甲方名称', '当前日期', '项目经理'],
    html: `
<h1>${ph('项目名称')}需求变更单</h1>
<table>
<tr><th style="width:26%">客户单位</th><td>${ph('甲方名称')}</td></tr>
<tr><th>提出日期</th><td>${ph('当前日期')}</td></tr>
<tr><th>受理人</th><td>${ph('项目经理')}</td></tr>
</table>
<h2>一、变更内容</h2>
<p>（在此填写需求变更的具体内容、涉及模块与变更原因。）</p>
<h2>二、影响评估</h2>
<table>
<tr><th style="width:26%">评估项</th><th>评估结论</th></tr>
<tr><td>工作量影响</td><td>待评估</td></tr>
<tr><td>进度影响</td><td>待评估</td></tr>
<tr><td>费用影响</td><td>待评估</td></tr>
</table>
<h2>三、变更确认</h2>
<table>
<tr><th>甲方（客户）确认</th><th>乙方（承建方）确认</th></tr>
<tr><td style="height:56px">签字（盖章）：<br/>${ph('签名')}</td><td style="height:56px">签字（盖章）：<br/>日期：${ph('当前日期')}</td></tr>
</table>`,
  },
  t10: {
    fields: ['项目名称', '甲方名称', '项目经理', '技术支持', '当前日期'],
    html: `
<h1>${ph('项目名称')}项目周报</h1>
<p>报告日期：${ph('当前日期')}&nbsp;&nbsp;项目经理：${ph('项目经理')}&nbsp;&nbsp;客户：${ph('甲方名称')}</p>
<h2>一、本周进展</h2>
<ul><li>完成本周计划任务，现场推进正常；</li><li>遗留问题持续跟踪处理。</li></ul>
<h2>二、下周计划</h2>
<ul><li>按计划推进下一阶段实施与联调；</li><li>输出阶段性交付物。</li></ul>
<h2>三、风险与问题</h2>
<table>
<tr><th style="width:46%">风险 / 问题</th><th style="width:22%">等级</th><th>应对措施</th></tr>
<tr><td>需甲方配合事项</td><td>关注</td><td>${ph('技术支持')} 跟进协调</td></tr>
</table>
<h2>四、需协调事项</h2>
<p>请各相关方及时反馈，确保项目按计划推进。</p>`,
  },
};

TEMPLATES.forEach(t => {
  const meta = RICH_TPL[t.id];
  if (meta) {
    t.fields = meta.fields;
    t.contentHTML = meta.html;
    t.isDefault = Boolean(meta.isDefault);
  }
  t.builtin = true;
  t.updatedAt = todayISO();
});

// 二级目录用途（文件管理器展示）
export const USAGE_DIR_LIST: { stage: PhaseKey; folders: string[] }[] = PHASE_KEYS.map(k => ({
  stage: k,
  folders: USAGE_DIRS[k],
}));