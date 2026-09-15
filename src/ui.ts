// 可复用 UI 组件（返回 HTML 字符串，配合内联 SVG 图标）
import type { Project, ProjectTask, StageStatus } from './data/types';
import { PHASE_META, ROLE_META } from './data/types';
import { fmtDate, LEVEL_META } from './lib';
import { getTeam } from './store';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => {
    return (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<
        string,
        string
      >
    )[c] ?? c;
  });
}

// ---- SVG 图标库 ----
const paths: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  list: 'M3 5h18M3 12h18M3 19h18',
  file: 'M6 2h8l4 4v16H6zM14 2v5h5',
  doc: 'M6 2h8l4 4v16H6zM14 2v5h5M9 13h6M9 17h6',
  bell: 'M12 6a6 6 0 0 1 6 6v5h2v2H4v-2h2v-5a6 6 0 0 1 6-6zM10 21a2 2 0 0 0 4 0',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4-4',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 21h16',
  upload: 'M12 15V3m0 0L8 7m4-4l4 4M4 21h16',
  chevron: 'M9 6l6 6-6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a7 7 0 0 1 16 0v1',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v3',
  logout: 'M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.2-1.6l2-1.6-2-3.4-2.4 1A7 7 0 0 0 12 5a7 7 0 0 0-1.4.2L9 4 7 7.4 9 9a7 7 0 0 0 0 6l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.4.2 7 7 0 0 0 1.4-.2l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .2-1l0 0z',
  plug: 'M12 2v8m0 0l-3-3m3 3l3-3M4 10h16v2a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-2zM14 22v-4M10 22v-4',
  home: 'M3 11l9-8 9 8M5 10v10h6v-6h4v6h6V10',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  printer: 'M6 9V3h12v6M18 9H6a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2zM7 18v4h10v-4M8 12h.01',
  print: 'M6 9V3h12v6M4 9h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2v4H6v-4H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM8 13h8v6H8z',
  chart: 'M4 20h16M7 20V11M12 20V6M17 20v-8',
  pie: 'M21 12a9 9 0 1 1-9-9v9zM15 3a9 9 0 0 1 6 6h-6z',
  megaphone: 'M3 11l14-6v14L3 13zM19 8v8M6 11v5',
  alert: 'M12 3l9 17H3zM12 10v4m0 3h.01',
  folder: 'M3 5h7l2 2h9v12H3z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  calendar: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 21v-2a5 5 0 0 1 7-4.6M15 5a3 3 0 1 1 0 6M15 15a5 5 0 0 1 5 5v1H10v-1a5 5 0 0 1 5-5z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  export: 'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4L9 20"/>',
  ul: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  ol: '<path d="M10 6h10M10 12h10M10 18h10M3.5 5.5h.01M3 11h2v.5H3M3.2 16.5l1.3-1v4"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
  table: '<path d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  starFill: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18M10.6 10.7a3 3 0 0 0 4.2 4.2M9.4 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 0 1-3.3 4M6.2 6.8C3.7 8.6 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.2 0 2.3-.3 3.3-.7"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
};

export function icon(name: string, size = 16, className = ''): string {
  const p = paths[name] ?? paths.grid;
  const inner = p.includes('<') ? p : `<path d="${p}"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="${className}">${inner}</svg>`;
}

// ---- 徽章 ----
export const PRIORITY_META: Record<Project['priority'], { label: string; color: string; bg: string }> = {
  normal: { label: '普通', color: '#6B7A90', bg: '#EEF2F7' },
  high: { label: '重要', color: '#C77700', bg: '#FDF1DF' },
  urgent: { label: '紧急', color: '#C00000', bg: '#FBEAEA' },
};

export function badge(text: string, fg: string, bg: string, extra = ''): string {
  return `<span class="inline-flex items-center px-1.5 py-px rounded text-[11px] font-medium whitespace-nowrap ${extra}" style="color:${fg};background:${bg}">${esc(text)}</span>`;
}

export function priorityBadge(p: Project['priority']): string {
  const m = PRIORITY_META[p];
  return badge(m.label, m.color, m.bg);
}

export function stageStatusBadge(st: StageStatus): string {
  if (st === 'done') return badge('已完成', '#4A8A3A', '#E8F3E4');
  if (st === 'active') return badge('进行中', '#3D74A8', '#EAF3FB');
  return badge('未开始', '#9AA7B8', '#EEF2F7');
}

export function taskStatusBadge(st: ProjectTask['status']): string {
  if (st === 'done') return badge('完成', '#4A8A3A', '#E8F3E4');
  if (st === 'doing') return badge('进行中', '#3D74A8', '#EAF3FB');
  return badge('待开始', '#9AA7B8', '#EEF2F7');
}

export function milestoneBadge(): string {
  return badge('里程碑', '#8A5A00', '#FBF2DA');
}

// ---- 对接人（甲方/乙方两行）----
export function contactBlock(p: Project): string {
  const clients = p.clients?.length ? p.clients : [{ name: p.contacts.a.name, tel: p.contacts.a.tel }];
  const mySide = [
    ...(p.teamOf?.tech ?? []).map(m => ({ m, r: 'tech' as const })),
    ...(p.teamOf?.sales ?? []).map(m => ({ m, r: 'sales' as const })),
    ...(p.teamOf?.dev ?? []).map(m => ({ m, r: 'dev' as const })),
  ];
  const clientTags = clients
    .map(
      c =>
        `<span class="c-client"><i class="c-name">${esc(c.name)}</i><i class="c-tel">${esc(c.tel)}</i></span>`,
    )
    .join('');
  // 仅展示仍存在于成员库中的我方成员；已从成员库删除的成员不再展示
  const activeIds = new Set(getTeam().map(t => t.id));
  const teamChips = mySide
    .filter(({ m }) => activeIds.has(m.id))
    .map(
      ({ m, r }) => {
        const tip = m.tel || '暂无联系方式';
        return `<span class="pchip" tabindex="0" style="--c:${ROLE_META[r].color}">${esc(m.name)}<span class="c-tel">${esc(tip)}</span></span>`;
      },
    )
    .join('') || '<span class="text-ink-faint text-[11px]">未安排</span>';
  return `<div class="space-y-1.5 min-w-[210px]">
    <div class="flex flex-wrap items-center gap-1.5 text-[12px] text-ink">
      <span class="c-badge">甲方</span>
      ${clientTags || '<span class="text-ink-faint text-[11px]">—</span>'}
    </div>
    <div class="flex flex-wrap items-center gap-1.5 text-[12px] text-ink">
      <span class="c-badge">我方</span>
      ${teamChips}
    </div>
  </div>`;
}

/** 阶段徽章（带色点） */
export function phaseCell(key: Project['stages'][number]['key'], compact = false): string {
  const m = PHASE_META[key];
  const inner = `<span class="inline-flex items-center gap-1 text-[12px] text-ink-soft">
    <span class="w-2 h-2 rounded-full shrink-0" style="background:${m.color}"></span>
    ${compact ? m.name : `<span class="font-medium text-ink">${m.code}</span> ${m.name}`}
  </span>`;
  return inner;
}

/** 进度条 */
export function progressBar(pct: number, color = '#5B9BD5', size = 'h-1.5'): string {
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="w-full ${size} rounded-full bg-hair overflow-hidden"><div class="h-full rounded-full transition-all" style="width:${w}%;background:${color}"></div></div>`;
}

/** 提醒级别徽章 */
export { LEVEL_META, fmtDate };
export const levelBadgeMeta = LEVEL_META;

/** 全局轻提示 toast */
export function toast(message: string, type: 'info' | 'success' | 'warn' = 'info'): void {
  const colors = { info: '#5B9BD5', success: '#70AD47', warn: '#E36C0A' };
  const el = document.createElement('div');
  el.textContent = message;
  const bar = document.createElement('div');
  bar.style.cssText = `border-left:3px solid ${colors[type]}`;
  el.appendChild(bar);
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:100;padding:9px 16px;background:#fff;border:1px solid #E1E8F0;border-radius:8px;box-shadow:0 6px 20px rgba(30,50,70,.14);font-size:13px;color:#2B3A4A;display:flex;align-items:center;gap:8px;animation:fadeIn .18s ease-out';
  const dot = document.createElement('span');
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${colors[type]}`;
  wrap.appendChild(dot);
  const txt = document.createElement('span');
  txt.textContent = message;
  wrap.appendChild(txt);
  document.body.appendChild(wrap);
  setTimeout(() => {
    wrap.style.transition = 'opacity .3s';
    wrap.style.opacity = '0';
    setTimeout(() => wrap.remove(), 320);
  }, 2200);
}