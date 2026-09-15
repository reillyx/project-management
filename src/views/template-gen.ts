// 生成文档：选择模板与项目 → 字段自动填充 → 预览 → 导出 Word
import { getProjects, getTemplates, getProject } from '../store';
import type { Project, TemplateDoc } from '../data/types';
import { fillTemplateHTML, exportWordDoc, setSignatureHeight } from './template-doc';
import { textToHtml } from './template-editor';
import { icon } from '../ui';

/** 从模板中心入口：需先选项目 */
export function openGenModal(tid?: string, projectId?: string): void {
  const projects = getProjects();
  const templates = getTemplates();
  const defaultTpl = templates.find(t => t.isDefault) ?? templates[0];
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
  <div class="bg-white rounded-lg w-[880px] max-w-[96vw] shadow-xl border border-line flex flex-col" style="max-height:92vh">
    <div class="flex items-center justify-between px-5 py-3.5 border-b border-hair shrink-0">
      <div class="text-[15px] font-semibold text-ink flex items-center gap-2">${icon('doc', 16)} 生成文档</div>
      <button class="g-close btn-ghost">${icon('x', 16)}</button>
    </div>
    <div class="px-5 py-4 grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 border-b border-hair shrink-0">
      <label class="block">
        <span class="block text-[12px] text-ink-soft mb-1">选择项目</span>
        <select id="genProject" class="input w-full">${projects
          .map(pr => `<option value="${pr.id}"${pr.id === projectId ? ' selected' : ''}>${escapeText(pr.name)}（${escapeText(pr.code)}）</option>`)
          .join('')}</select>
      </label>
      <label class="block">
        <span class="block text-[12px] text-ink-soft mb-1">选择模板</span>
        <select id="genTpl" class="input w-full">${templates
          .map(t => `<option value="${t.id}"${t.id === (tid ?? defaultTpl?.id) ? ' selected' : ''}>${escapeText(t.name)}</option>`)
          .join('')}</select>
      </label>
    </div>
    <div class="p-4 overflow-auto bg-canvas/50 flex-1">
      <div id="genPreview" class="tpl-sheet"></div>
    </div>
    <div class="flex items-center justify-between px-5 py-3 border-t border-hair bg-canvas/40 shrink-0 rounded-b-lg">
      <div class="flex items-center gap-3 min-w-0">
        <span id="genFields" class="text-[11px] text-ink-faint truncate"></span>
        <label class="flex items-center gap-1.5 text-[11px] text-ink-soft shrink-0 ml-2">
          ${icon('edit', 12)} 签名大小
          <select id="genSig" class="input !w-[74px] !py-1 !text-[11px]">
            <option value="28">小</option>
            <option value="40" selected>中</option>
            <option value="56">大</option>
          </select>
        </label>
      </div>
      <div class="flex gap-2 shrink-0">
        <button class="g-close btn">关闭</button>
        <button id="genExport" class="btn-primary">${icon('download', 14)} 导出 Word</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(bg);

  const close = () => bg.remove();
  bg.querySelectorAll('.g-close').forEach(b => b.addEventListener('click', close));
  bg.addEventListener('click', e => { if (e.target === bg) close(); });

  const pSel = bg.querySelector('#genProject') as HTMLSelectElement;
  const tSel = bg.querySelector('#genTpl') as HTMLSelectElement;
  const preview = bg.querySelector('#genPreview') as HTMLElement;
  const fieldsHint = bg.querySelector('#genFields') as HTMLElement;

  const renderPreview = () => {
    const p = getProject(pSel.value);
    const tpl = getTemplates().find(t => t.id === tSel.value);
    if (!p || !tpl) return;
    const src = tpl.contentHTML || textToHtml(tpl.content || '');
    preview.innerHTML = `<h1>${escapeText(tpl.name)}</h1>` + fillTemplateHTML(src, p);
    const used = extractFields(src);
    const missing = used.filter(f => isEmptyValue(p, f));
    fieldsHint.innerHTML = missing.length
      ? `<span style="color:#C00000">待补充字段：${missing.map(escapeText).join('、')}（已标红）</span>`
      : `已自动填充 ${used.length} 个字段`;
  };
  pSel.addEventListener('change', renderPreview);
  tSel.addEventListener('change', renderPreview);
  bg.querySelector('#genSig')?.addEventListener('change', e => {
    setSignatureHeight(Number((e.target as HTMLSelectElement).value));
    renderPreview();
  });
  renderPreview();

  bg.querySelector('#genExport')?.addEventListener('click', () => {
    const p = getProject(pSel.value) as Project;
    const tpl = getTemplates().find(t => t.id === tSel.value) as TemplateDoc;
    const src = tpl.contentHTML || textToHtml(tpl.content || '');
    const body = `<h1>${escapeText(tpl.name)}</h1>` + fillTemplateHTML(src, p);
    exportWordDoc(`${tpl.name}_${p.name}`, body, `${tpl.name}_${p.code}`);
  });
}

function extractFields(html: string): string[] {
  const div = document.createElement('div');
  div.innerHTML = html;
  const fromSpan = Array.from(div.querySelectorAll<HTMLElement>('.tpl-ph')).map(el => el.getAttribute('data-field') || '');
  const fromText = Array.from((div.textContent || '').matchAll(/\{([^}]+)\}/g)).map(m => m[1].trim());
  return Array.from(new Set([...fromSpan, ...fromText].filter(Boolean)));
}

function isEmptyValue(p: Project, name: string): boolean {
  const map: Record<string, string> = {
    项目名称: p.name,
    项目编号: p.code,
    甲方名称: p.customer,
    合同编号: p.contract?.no ?? '',
    合同名称: p.contract?.name ?? '',
    金额: p.contract?.amount ?? p.budget ?? '',
    交付日期: p.planEnd ?? '',
    计划开始: p.planStart ?? '',
    项目经理: p.manager,
  };
  if (name in map) return !map[name];
  if (name === '技术支持' || name === '销售' || name === '开发') {
    const list = p.teamOf?.[name === '技术支持' ? 'tech' : name === '销售' ? 'sales' : 'dev'];
    return !list || list.length === 0;
  }
  return false; // 当前日期、项目进度等总有值
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
