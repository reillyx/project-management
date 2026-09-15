// 通用工具函数
import type { Reminder, Project } from './data/types';
import { PHASE_KEYS } from './data/types';

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 将日期加 N 天，返回 ISO 字符串 */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(offset = 0): string {
  return addDays(toISO(new Date()), offset);
}

/** 比较两个 ISO 日期（忽略时间），返回 a-b 的天数差 */
export function diffDays(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((da - db) / 86400000);
}

/** 将 ISO 日期格式化为 2026/01/15 */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}/${m}/${d}`;
}

/** 将 ISO 日期格式化为 2026-01-15 */
export function fmtISO(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}-${m}-${d}`;
}

/** 距今天数（负=已过期） */
export function daysUntil(iso: string): number {
  return diffDays(iso, todayISO());
}

/** 基于剩余天数计算提醒等级 */
export function remindLevel(days: number): Reminder['level'] {
  if (days < 0) return 'overdue';
  if (days <= 1) return 'urgent';
  if (days <= 3) return 'warning';
  return 'warning';
}

export const LEVEL_META: Record<
  Reminder['level'],
  { label: string; color: string; bg: string }
> = {
  overdue: { label: '已逾期', color: '#C00000', bg: '#FBEAEA' },
  urgent: { label: '1天内到期', color: '#E36C0A', bg: '#FCF0E4' },
  warning: { label: '3天内到期', color: '#B8860B', bg: '#FBF4DC' },
};

/** 进度百分比 */
export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/** 生成甘特时间轴（月份标题网格）：返回该区间内各月标签 */
export function monthAxis(from: string, to: string): { label: string; days: number; col: number }[] {
  const start = new Date(from);
  const end = new Date(to);
  const months: { label: string; days: number; col: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  let col = 0;
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const last = new Date(y, m + 1, 0);
    const dur = Math.min(last.getDate(), end.getDate()) + (y === start.getFullYear() && m === start.getMonth() ? 1 - start.getDate() : 0);
    const daysInMonth = last.getDate();
    const cols = Math.max(1, Math.min(dur, daysInMonth));
    months.push({ label: `${y}年${m + 1}月`, days: daysInMonth, col: daysInMonth });
    void cols;
    col += daysInMonth;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/** 计算某日期在时间轴中的列位置（从0天开始计数） */
export function colOf(date: string, start: string): number {
  return diffDays(date, start);
}

/** 生成甘特时间轴月份刻度：返回各月起始像素索引 + 当月天数 */
export function monthTicks(
  axisStart: string,
  axisEnd: string,
): { label: string; fromIdx: number; days: number }[] {
  const months: { label: string; fromIdx: number; days: number }[] = [];
  const end = new Date(`${axisEnd}T00:00:00`);
  let cur = new Date(`${axisStart}T00:00:00`);
  cur.setDate(1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    const firstDay = toISO(new Date(y, m, 1));
    months.push({ label: `${y}年${m + 1}月`, fromIdx: Math.max(0, diffDays(firstDay, axisStart)), days: dim });
    cur = new Date(y, m + 1, 1);
  }
  return months;
}

/** 判断提醒是否在 3 天窗口内（含逾期） */
export function isNear(days: number): boolean {
  return days <= 3; // 逾期也为 true（会被 level 区分）
}

/** 计算项目总体进度 = 已完成阶段/总阶段（阶段级） */
export function stageProgress(activeStageIdx: number): number {
  return Math.round((Math.min(activeStageIdx, PHASE_KEYS.length) / PHASE_KEYS.length) * 100);
}

/** 名称截断 */
export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 下载 Blob 文本为文件 */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 将数组转为 CSV（带 BOM，Excel 中文不乱码） */
export function toCSV(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n');
}

export function toExcelXML(rows: (string | number)[][]): string {
  const cols = rows[0] ? rows[0].length : 0;
  const escXML = (v: string | number) =>
    String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const sheet = rows
    .map(
      r =>
        `<Row>${Array.from({ length: cols })
          .map((_, i) => `<Cell><Data ss:Type="String">${escXML(r[i] ?? '')}</Data></Cell>`)
          .join('')}</Row>`,
    )
    .join('');
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="h"><Font ss:Bold="1"/></Style>
 </Styles>
 <Worksheet ss:Name="项目清单"><Table>${sheet}</Table></Worksheet>
</Workbook>`;
}

/** 金额统一显示为「数值￥」格式；无金额返回 '—'，非金额标记（如「待定」）原样返回 */
export function fmtMoney(v?: string | number): string {
  if (v === undefined || v === null || v === '') return '—';
  const s = String(v).trim().replace(/^[¥￥]\s*/, '');
  if (!s) return '—';
  if (/^\d+(\.\d+)?$/.test(s)) return `${Number(s).toLocaleString('zh-CN')}￥`;
  return /[0-9]/.test(s) ? `${s}￥` : s;
}

/** 工具提示 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => {
    return (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
    )[c] ?? c;
  });
}

export { Project };
export type { Project as ProjectType } from './data/types';

/** 预置草书「张启凡」签名：手写感连续笔触，透明底 SVG dataURL */
export function presetSignature(name = '张启凡'): string {
  const w = 420;
  const h = 130;
  const n = Math.max(2, name.length);
  const step = w / (n * 2.2);
  let path = '';
  let x = 26;
  let up = true;
  for (let i = 0; i < n * 2; i++) {
    const nx = x + step;
    const peak = up ? 20 + (i % 2) * 13 : h - 20 - (i % 2) * 13;
    path += ` C${(x + step * 0.5).toFixed(1)},${up ? 12 : 106} ${(nx - step * 0.5).toFixed(1)},${up ? 118 : 16} ${nx.toFixed(1)},${peak}`;
    x = nx;
    up = !up;
  }
  const d = 'M26,70' + path;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<path d="${d}" fill="none" stroke="#1F2A38" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" transform="translate(6,5)" fill="none" stroke="rgba(31,42,56,0.12)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** 用 SheetJS 真正导出 .xlsx（避免旧版 Excel 对 XML 格式的安全警告） */
export async function exportXlsx(filename: string, sheetTitle: string, rows: (string | number)[][]): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetTitle || 'Sheet1').slice(0, 31));
  XLSX.writeFile(wb, filename);
}

/** 带样式的 .xlsx 导出（品牌色表头 + 红色逾期行），基于 xlsx-js-style */
export function exportXlsxStyled(filename: string, sheetTitle: string, header: (string | number)[], body: (string | number)[][], opts: { redRows?: number[] } = {}): void {
  // 同步、异步两种入口都尝试：优先走 xlsx-js-style（支持样式）
  void (async () => {
    let XLSX: typeof import('xlsx');
    try {
      XLSX = (await import('xlsx-js-style')) as unknown as typeof import('xlsx');
    } catch {
      XLSX = await import('xlsx');
    }
    const all = [header, ...body];
    const ws = XLSX.utils.aoa_to_sheet(all);
    const redRow = opts.redRows ?? [];
    // 为单元格写样式：表头品牌色白字，指定行红色
    all.forEach((row, r) => {
      row.forEach((_, c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) return;
        if (r === 0) {
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: '5B9BD5' } },
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          };
        } else if (redRow.includes(r - 1)) {
          cell.s = { font: { color: { rgb: 'C00000' }, bold: true } };
        } else {
          cell.s = { alignment: { vertical: 'center' } };
        }
      });
    });
    ws['!cols'] = (header as unknown[]).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (sheetTitle || 'Sheet1').slice(0, 31));
    XLSX.writeFile(wb, filename);
  })();
}

interface ReportSheet {
  title: string;
  header: (string | number)[];
  body: (string | number)[][];
  redRows?: number[];
}

/** 单工作簿多工作表导出：表头品牌色 #5B9BD5 白字，redRows 指定行红色标注 */
export function exportXlsxReport(filename: string, sheets: ReportSheet[]): void {
  void (async () => {
    let XLSX: typeof import('xlsx');
    try {
      XLSX = (await import('xlsx-js-style')) as unknown as typeof import('xlsx');
    } catch {
      XLSX = await import('xlsx');
    }
    const wb = XLSX.utils.book_new();
    sheets.forEach(sh => {
      const all = [sh.header, ...sh.body];
      const ws = XLSX.utils.aoa_to_sheet(all);
      const red = sh.redRows ?? [];
      all.forEach((row, r) => {
        row.forEach((_, c) => {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (!cell) return;
          if (r === 0) {
            cell.s = {
              fill: { patternType: 'solid', fgColor: { rgb: '5B9BD5' } },
              font: { bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: 'center', vertical: 'center' },
            };
          } else if (red.includes(r - 1)) {
            cell.s = {
              fill: { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } },
              font: { color: { rgb: '9C0006' }, bold: true },
              alignment: { vertical: 'center' },
            };
          } else {
            cell.s = { alignment: { vertical: 'center' } };
          }
        });
      });
      ws['!cols'] = (sh.header as unknown[]).map(() => ({ wch: 16 }));
      XLSX.utils.book_append_sheet(wb, ws, (sh.title || 'Sheet1').slice(0, 31));
    });
    XLSX.writeFile(wb, filename);
  })();
}

/** 由主色派生同色系深浅色（供 CSS 变量使用） */
export function themeVars(brand: string): { deep: string; soft: string } {
  const hex = brand.replace('#', '');
  const num = parseInt(hex || '5B9BD5', 16);
  if (isNaN(num) || hex.length !== 6) return { deep: '#4A8BC2', soft: '#EAF3FB' };
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const shade = (f: number) =>
    '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')).join('');
  return { deep: shade(0.82), soft: shade(1.16) };
}

/** 将系统设置应用到页面：品牌主色 CSS 变量 + 全局字号 */
export function applySysSettings(s: { brand: string; fs: number }): void {
  const st = document.documentElement.style;
  const { deep, soft } = themeVars(s.brand);
  st.setProperty('--brand', s.brand);
  st.setProperty('--brand-deep', deep);
  st.setProperty('--brand-soft', soft);
  document.body.style.fontSize = `${s.fs}px`;
}