// 预留扣子(AI)调用接口：项目 / 团队成员 / 文档模板 / 系统设置 的完整 CRUD，
// 以及 /api/sync 全量同步接口。所有操作持久化到 data/db.json。
import { Router, type Request, type Response } from 'express';
import { getDB, saveDB, newId, type DB } from '../store';
import type { Project, TeamMember, TemplateDoc } from '../../src/data/types';

const router = Router();

/** 通用 CRUD 子路由生成器（用于 projects / team / templates） */
function crud<T extends { id: string }>(
  list: () => T[],
  set: (arr: T[]) => void,
  prefix: string,
): Router {
  const r = Router();
  r.get('/', (_req: Request, res: Response) => {
    res.json(list());
  });
  r.post('/', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<T>;
    const item = { ...body, id: body.id ?? newId(prefix) } as T;
    const arr = list();
    arr.push(item);
    set(arr);
    saveDB();
    res.status(201).json(item);
  });
  r.get('/:id', (req: Request, res: Response) => {
    const it = list().find(x => x.id === req.params.id);
    if (!it) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(it);
  });
  r.put('/:id', (req: Request, res: Response) => {
    const arr = list();
    const i = arr.findIndex(x => x.id === req.params.id);
    if (i < 0) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const body = (req.body ?? {}) as Partial<T>;
    arr[i] = { ...arr[i], ...body, id: arr[i].id } as T;
    set(arr);
    saveDB();
    res.json(arr[i]);
  });
  r.delete('/:id', (req: Request, res: Response) => {
    set(list().filter(x => x.id !== req.params.id));
    saveDB();
    res.json({ success: true });
  });
  return r;
}

// 项目（一对多：项目 <-> 阶段/任务/合同/对接人/文件 均内嵌于项目对象）
router.use(
  '/api/projects',
  crud<Project>(
    () => getDB().projects,
    arr => {
      getDB().projects = arr;
    },
    'p',
  ),
);

// 团队成员
router.use(
  '/api/team',
  crud<TeamMember>(
    () => getDB().team,
    arr => {
      getDB().team = arr;
    },
    'm',
  ),
);

// 文档模板
router.use(
  '/api/templates',
  crud<TemplateDoc>(
    () => getDB().templates,
    arr => {
      getDB().templates = arr;
    },
    't',
  ),
);

// 系统设置
router.get('/api/settings', (_req: Request, res: Response) => {
  res.json(getDB().settings);
});
router.put('/api/settings', (req: Request, res: Response) => {
  getDB().settings = {
    ...getDB().settings,
    ...((req.body ?? {}) as Record<string, string | number | boolean>),
  };
  saveDB();
  res.json(getDB().settings);
});

// 全量同步（前端启动时拉取、变更后写回；AI 也可用它一次性读取/写入所有数据）
router.get('/api/sync', (_req: Request, res: Response) => {
  res.json(getDB());
});
router.post('/api/sync', (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Partial<DB>;
  const d = getDB();
  if (Array.isArray(b.projects)) d.projects = b.projects;
  if (Array.isArray(b.team)) d.team = b.team;
  if (Array.isArray(b.templates)) d.templates = b.templates;
  if (b.settings) d.settings = b.settings;
  saveDB();
  res.json({ success: true, updatedAt: new Date().toISOString() });
});

// 健康检查
router.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    env: process.env.COZE_PROJECT_ENV,
    timestamp: new Date().toISOString(),
  });
});

// 接口自述文档（方便扣子/AI 发现接口）
router.get('/api/help', (_req: Request, res: Response) => {
  res.json({
    name: 'IT集成项目管理系统 · 预留数据接口',
    note: '数据持久化于应用同级 data/db.json，AI 可直接调用这些 REST 接口读取/写入业务数据。',
    endpoints: [
      { method: 'GET', path: '/api/sync', desc: '一次性读取全部数据 {projects, team, templates, settings}' },
      { method: 'POST', path: '/api/sync', desc: '一次性写入全部数据（前端保存时调用，AI 也可调用）' },
      { method: 'GET', path: '/api/projects', desc: '项目列表' },
      { method: 'POST', path: '/api/projects', desc: '新增项目（body 为项目对象，缺省自动生成 id）' },
      { method: 'GET', path: '/api/projects/:id', desc: '获取单个项目（含其阶段/任务/合同/对接人）' },
      { method: 'PUT', path: '/api/projects/:id', desc: '整体替换或部分更新项目（body 字段会合并）' },
      { method: 'DELETE', path: '/api/projects/:id', desc: '删除项目' },
      { method: 'GET/POST', path: '/api/team', desc: '团队成员列表 / 新增成员' },
      { method: 'PUT/DELETE', path: '/api/team/:id', desc: '更新 / 删除成员' },
      { method: 'GET/POST', path: '/api/templates', desc: '文档模板列表 / 新增模板' },
      { method: 'GET/PUT', path: '/api/settings', desc: '读取 / 更新系统设置' },
      { method: 'GET', path: '/api/health', desc: '健康检查' },
    ],
  });
});

export default router;