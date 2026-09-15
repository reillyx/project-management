// 本地 JSON 数据存储层：作为"预留扣子/AI 调用接口"的持久化底座。
// 数据落在应用同级 data/db.json，AI 助手可通过 REST 接口读写，也可直接编辑该文件。
import fs from 'node:fs';
import path from 'node:path';
import type { Project, TeamMember, TemplateDoc } from '../src/data/types';

export interface DB {
  projects: Project[];
  team: TeamMember[];
  templates: TemplateDoc[];
  settings: Record<string, string | number | boolean>;
}

const dataDir = process.env.COZE_WORKSPACE_PATH
  ? path.join(process.env.COZE_WORKSPACE_PATH, 'data')
  : path.join(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'db.json');

let db: DB | null = null;

function emptyDB(): DB {
  return { projects: [], team: [], templates: [], settings: {} };
}

export function getDB(): DB {
  if (db) return db;
  try {
    if (fs.existsSync(dbFile)) {
      db = { ...emptyDB(), ...JSON.parse(fs.readFileSync(dbFile, 'utf8')) };
    }
  } catch {
    db = null;
  }
  if (!db) db = emptyDB();
  return db;
}

/** 将内存数据写回磁盘（每次变更后调用，保证 AI / 前端 / 退出后仍可读取） */
export function saveDB(): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

/** 生成短 ID：p_x1a2b / m_x3c4d / t_x5e6f 等 */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
}