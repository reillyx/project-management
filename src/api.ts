// 前端 API 客户端：与后端预留的扣子/AI 接口同源调用，做持久化与数据同步。
import type { Project, Signature, TeamMember, TemplateDoc, TimeRecord } from './data/types';

export interface SyncPayload {
  projects: Project[];
  team: TeamMember[];
  templates: TemplateDoc[];
  signatures: Signature[];
  hours: TimeRecord[];
  settings: Record<string, string | number | boolean>;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  list: <T,>(name: string) => req<T[]>(`/api/${name}`),
  get: <T,>(name: string, id: string) => req<T>(`/api/${name}/${id}`),
  create: <T,>(name: string, body: unknown) =>
    req<T>(`/api/${name}`, { method: 'POST', body: JSON.stringify(body) }),
  update: <T,>(name: string, id: string, body: unknown) =>
    req<T>(`/api/${name}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  del: (name: string, id: string) =>
    req<{ success: boolean }>(`/api/${name}/${id}`, { method: 'DELETE' }),
  fetchSync: () => req<SyncPayload>(`/api/sync`),
  postSync: (payload: SyncPayload) =>
    req<{ success: boolean }>(`/api/sync`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};