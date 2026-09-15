// 模板字段、占位符、Word 导出与 docx 解析的共享逻辑
import type { Project } from '../data/types';
import { fmtDate, todayISO } from '../lib';
import { currentSignature, signatureImg } from './signature';

/** 可插入的动态字段（系统自动维护） */
export interface FieldDef {
  name: string; // 占位符名称（不含花括号）
  label: string; // 展示名
  group: '基本信息' | '合同' | '人员' | '日期';
  builtin?: boolean; // 预置字段（不可改名）
}

export const FIELD_DEFS: FieldDef[] = [
  { name: '项目名称', label: '项目名称', group: '基本信息', builtin: true },
  { name: '项目编号', label: '项目编号', group: '基本信息', builtin: true },
  { name: '甲方名称', label: '甲方/客户名称', group: '基本信息', builtin: true },
  { name: '合同编号', label: '合同编号', group: '合同', builtin: true },
  { name: '合同名称', label: '合同名称', group: '合同', builtin: true },
  { name: '金额', label: '合同金额', group: '合同', builtin: true },
  { name: '交付日期', label: '计划交付日期', group: '日期', builtin: true },
  { name: '计划开始', label: '计划开始日期', group: '日期', builtin: true },
  { name: '当前日期', label: '当前日期', group: '日期', builtin: true },
  { name: '项目经理', label: '项目经理', group: '人员', builtin: true },
  { name: '技术支持', label: '技术支持', group: '人员', builtin: true },
  { name: '销售', label: '销售', group: '人员', builtin: true },
  { name: '开发', label: '开发', group: '人员', builtin: true },
  { name: '甲方联系人', label: '甲方联系人', group: '人员', builtin: true },
  { name: '项目进度', label: '总体进度', group: '基本信息', builtin: true },
  { name: '签名', label: '我的电子签名', group: '人员', builtin: true },
];

/** 模板类型（上传/新建时可选） */
export const TEMPLATE_CATEGORIES = [
  '立项类',
  '方案类',
  '需求类',
  '会议纪要',
  '培训类',
  '上线类',
  '试运行类',
  '验收类',
  '变更类',
  '汇报类',
  '其他',
];

/** 生成字段占位符标签 HTML（编辑器/预览统一使用 .tpl-ph 样式） */
export function fieldSpan(name: string): string {
  return `<span class="tpl-ph" contenteditable="false" data-field="${name}">{${name}}</span>`;
}

function joinPeople(list: { name: string; tel?: string }[] | undefined): string {
  if (!list || list.length === 0) return '';
  return list
    .map(m => (m.tel ? `${m.name}（${m.tel}）` : m.name))
    .join('、');
}

/** 依据项目解析字段值 */
export function resolveFields(p: Project): Record<string, string> {
  const team = p.teamOf ?? { tech: [], sales: [], dev: [] };
  const clientContacts =
    p.clients && p.clients.length > 0
      ? p.clients.map(c => `${c.name}${c.tel ? `（${c.tel}）` : ''}`).join('、')
      : (p.contacts?.a?.name ?? '');
  return {
    项目名称: p.name || '',
    项目编号: p.code || '',
    甲方名称: p.customer || '',
    合同编号: p.contract?.no || '',
    合同名称: p.contract?.name || '',
    金额: p.contract?.amount || p.budget || '',
    交付日期: p.planEnd ? fmtDate(p.planEnd) : '',
    计划开始: p.planStart ? fmtDate(p.planStart) : '',
    当前日期: fmtDate(todayISO()),
    项目经理: p.manager || '',
    技术支持: joinPeople(team.tech),
    销售: joinPeople(team.sales),
    开发: joinPeople(team.dev),
    甲方联系人: clientContacts,
    项目进度: `${p.progress ?? 0}%`,
  };
}

/** 将模板富文本中的字段占位符替换为项目实际值，返回纯 HTML */
export function fillTemplateHTML(html: string, p: Project): string {
  const values = resolveFields(p);
  // 替换 <span class="tpl-ph" data-field="X">{X}</span>
  const replaced = html.replace(
    /<span[^>]*class="tpl-ph"[^>]*data-field="([^"]+)"[^>]*>[\s\S]*?<\/span>/g,
    (_m, name: string) => {
      const n = name.trim();
      if (n === '签名') {
        const sig = currentSignature();
        return sig ? signatureImg(sig, sigH) : `<span style="color:#C00000">【请先到个人中心设置电子签名】</span>`;
      }
      const v = values[n];
      return v != null && v !== '' ? escHtml(v) : `<span style="color:#C00000">【${n}待补充】</span>`;
    },
  );
  // 兼容纯文本 {字段} 写法
  return replaced.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    const n = name.trim();
    if (n === '签名') {
      const sig = currentSignature();
      return sig ? signatureImg(sig, sigH) : `【请先到个人中心设置电子签名】`;
    }
    const v = values[n];
    return v != null && v !== '' ? escHtml(v) : `【${n}待补充】`;
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let sigH = 40;
/** 设置生成文档中电子签名的高度（等比缩放），默认 40px */
export function setSignatureHeight(px: number): void {
  sigH = Math.max(16, Math.min(80, Math.round(px)));
}

/** 导出为 Word(.doc)：以 HTML 包裹，保留富文本格式 */
export function exportWordDoc(title: string, bodyHTML: string, filename: string): void {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 2.2cm 2.5cm; }
body { font-family: "Microsoft YaHei","微软雅黑",sans-serif; font-size: 11pt; color:#2B3A4A; line-height:1.8; }
h1 { font-size: 20pt; text-align:center; color:#3D74A8; margin:0 0 6pt; }
h2 { font-size: 14pt; color:#3D74A8; border-bottom:1px solid #5B9BD5; padding-bottom:3pt; margin:14pt 0 6pt; }
h3 { font-size: 12pt; color:#2B3A4A; margin:10pt 0 4pt; }
p { margin:4pt 0; }
table { border-collapse:collapse; width:100%; margin:8pt 0; }
td,th { border:1px solid #9DB7CF; padding:6pt 9pt; font-size:10.5pt; vertical-align:top; }
th { background:#EAF3FB; font-weight:600; }
.tpl-ph { background:#EAF3FB; color:#3D74A8; padding:1pt 3pt; border-radius:3px; }
</style></head>
<body>${bodyHTML}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.doc') ? filename : `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 用 mammoth 解析 .docx 为 HTML（浏览器端） */
export async function parseDocx(file: File): Promise<string> {
  const mammoth: typeof import('mammoth/mammoth.browser') = await import('mammoth/mammoth.browser');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value || '<p></p>';
}
