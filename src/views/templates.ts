// 文档模板中心：卡片列表、类型筛选、上传 docx、预览、富文本编辑、删除、设默认、生成文档
import { getTemplates, removeTemplate, setDefaultTemplate, addTemplate } from '../store';
import type { TemplateDoc } from '../data/types';
import { TEMPLATE_CATEGORIES, parseDocx } from './template-doc';
import { openTplEditor, blankContentHTML, textToHtml, fmtUpdated } from './template-editor';
import { openGenModal } from './template-gen';
import { uid } from '../lib';
import { esc, icon, toast } from '../ui';

export function renderTemplates(root: HTMLElement): void {
  let filter = '';

  const draw = () => {
    const all = getTemplates();
    const cats = Array.from(new Set([...TEMPLATE_CATEGORIES, ...all.map(t => t.category)]));
    const list = filter ? all.filter(t => t.category === filter) : all;

    const catTabs = `<div class="flex items-center gap-1.5 flex-wrap">
      <button class="tpl-cat px-2.5 py-1 rounded-md text-[12px] transition-colors ${filter === '' ? 'bg-brand text-white' : 'text-ink-soft hover:bg-brand-soft border border-transparent'}" data-cat="">全部</button>
      ${cats
        .map(
          c => `<button class="tpl-cat px-2.5 py-1 rounded-md text-[12px] transition-colors ${filter === c ? 'bg-brand text-white' : 'text-ink-soft hover:bg-brand-soft border border-transparent'}" data-cat="${esc(c)}">${esc(c)}</button>`,
        )
        .join('')}
    </div>`;

    const grid = `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      ${list.map(card).join('') || `<div class="col-span-full text-center text-ink-faint text-[13px] py-12">该类型下暂无模板</div>`}
    </div>`;

    root.innerHTML = `
    <div class="max-w-[1200px] mx-auto space-y-4 view-enter">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('doc', 17)} 文档模板库
          <span class="text-[11px] font-normal text-ink-faint">共 ${all.length} 套模板</span>
        </div>
        <div class="flex items-center gap-2">
          <button id="tplBlank" class="btn">${icon('plus', 14)} 新建空白模板</button>
          <button id="tplUpload" class="btn-primary">${icon('upload', 14)} 上传 Word 模板</button>
          <input id="tplFile" type="file" accept=".docx,.doc" class="hidden" />
        </div>
      </div>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>${catTabs}</div>
        <span class="text-[11px] text-ink-faint">支持 .docx 上传自动解析；生成时自动填充项目信息并导出 Word</span>
      </div>
      ${grid}
    </div>`;

    root.querySelectorAll<HTMLElement>('.tpl-cat').forEach(el => {
      el.addEventListener('click', () => {
        filter = el.getAttribute('data-cat') || '';
        draw();
      });
    });
    root.querySelector('#tplBlank')?.addEventListener('click', () => createBlank(draw));
    root.querySelector('#tplUpload')?.addEventListener('click', () => {
      (root.querySelector('#tplFile') as HTMLInputElement)?.click();
    });
    root.querySelector('#tplFile')?.addEventListener('change', e => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file) handleUpload(file, draw);
      input.value = '';
    });

    bindCardActions(root, draw);
  };

  draw();
}

function card(t: TemplateDoc): string {
  const fieldChips = t.fields.slice(0, 5).map(f => `<span class="px-1.5 py-0.5 rounded bg-brand-light text-brand-deep text-[10px]">{${esc(f)}}</span>`).join('');
  return `
  <div class="card p-4 flex flex-col gap-2.5" data-tid="${t.id}">
    <div class="flex items-start gap-2.5">
      <div class="w-9 h-10 rounded flex items-center justify-center text-white text-[11px] font-semibold shrink-0" style="background:#3D74A8">${esc(t.category.slice(0, 2))}</div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <div class="text-[14px] font-semibold text-ink truncate">${esc(t.name)}</div>
          ${t.isDefault ? `<span class="text-[#E3A008]" title="默认模板">${icon('starFill', 13)}</span>` : ''}
        </div>
        <div class="text-[10px] text-ink-faint mt-0.5">${esc(t.category)} · 修改于 ${fmtUpdated(t.updatedAt)}${t.builtin ? ' · 预置' : ''}</div>
      </div>
    </div>
    <div class="text-[12px] text-ink-soft leading-relaxed flex-1">${esc(t.desc || '（暂无描述）')}</div>
    <div>
      <div class="text-[10px] text-ink-faint mb-1">自动填充字段：</div>
      <div class="flex flex-wrap gap-1">${fieldChips}${t.fields.length > 5 ? `<span class="px-1.5 text-[10px] text-ink-faint">+${t.fields.length - 5}</span>` : ''}</div>
    </div>
    <div class="flex items-center gap-1.5 pt-2 border-t border-hair flex-wrap">
      <button class="tpl-view btn-ghost px-2 py-1 text-[11px]" data-tid="${t.id}">${icon('eye', 13)} 预览</button>
      <button class="tpl-edit btn-ghost px-2 py-1 text-[11px]" data-tid="${t.id}">${icon('edit', 13)} 编辑</button>
      <button class="tpl-gen btn-primary px-2.5 py-1 text-[11px] ml-auto" data-tid="${t.id}">${icon('doc', 13)} 生成</button>
    </div>
    <div class="flex items-center gap-3 text-[11px] -mt-1">
      <button class="tpl-default text-ink-faint hover:text-[#E3A008] flex items-center gap-1" data-tid="${t.id}">${t.isDefault ? icon('starFill', 12) : icon('star', 12)} ${t.isDefault ? '已设为默认' : '设为默认'}</button>
      ${t.builtin ? '' : `<button class="tpl-del text-ink-faint hover:text-[#C00000] flex items-center gap-1" data-tid="${t.id}">${icon('trash', 12)} 删除</button>`}
    </div>
  </div>`;
}

function bindCardActions(root: HTMLElement, redraw: () => void): void {
  root.querySelectorAll<HTMLElement>('.tpl-view').forEach(b =>
    b.addEventListener('click', () => { const t = find(b); if (t) openPreview(t, redraw); }));
  root.querySelectorAll<HTMLElement>('.tpl-edit').forEach(b =>
    b.addEventListener('click', () => { const t = find(b); if (t) openTplEditor(t, redraw); }));
  root.querySelectorAll<HTMLElement>('.tpl-gen').forEach(b =>
    b.addEventListener('click', () => { const id = b.getAttribute('data-tid'); if (id) openGenModal(id); }));
  root.querySelectorAll<HTMLElement>('.tpl-default').forEach(b =>
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-tid');
      if (id) { setDefaultTemplate(id); toast('已设为默认模板', 'success'); redraw(); }
    }));
  root.querySelectorAll<HTMLElement>('.tpl-del').forEach(b =>
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-tid');
      const t = getTemplates().find(x => x.id === id);
      if (t && window.confirm(`确定删除模板「${t.name}」吗？`)) { removeTemplate(id!); toast('模板已删除', 'success'); redraw(); }
    }));
}

function find(btn: HTMLElement): TemplateDoc | undefined {
  return getTemplates().find(t => t.id === btn.getAttribute('data-tid'));
}

/* ---------- 预览（只读，可转编辑/生成） ---------- */
function openPreview(t: TemplateDoc, redraw: () => void): void {
  const src = t.contentHTML || textToHtml(t.content || '');
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.style.overflow = 'auto';
  bg.innerHTML = `
  <div class="bg-white rounded-lg w-[760px] max-w-[94vw] mx-auto shadow-xl border border-line flex flex-col" style="max-height:92vh">
    <div class="flex items-center justify-between px-5 py-3 border-b border-hair shrink-0">
      <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('eye', 16)} ${esc(t.name)}
        <span class="ml-1 text-[11px] font-normal text-ink-faint bg-canvas/70 px-2 py-0.5 rounded">${esc(t.category)}</span>
      </div>
      <button class="pv-close btn-ghost">${icon('x', 16)}</button>
    </div>
    <div class="p-4 overflow-auto bg-canvas/50 flex-1">
      <div class="tpl-sheet">${src}</div>
    </div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-hair bg-canvas/40 shrink-0 rounded-b-lg">
      <button class="pv-close btn">关闭</button>
      <button id="pvEdit" class="btn">${icon('edit', 14)} 编辑</button>
      <button id="pvGen" class="btn-primary">${icon('doc', 14)} 用此模板生成</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.querySelectorAll('.pv-close').forEach(b => b.addEventListener('click', close));
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  bg.querySelector('#pvEdit')?.addEventListener('click', () => { close(); openTplEditor(t, redraw); });
  bg.querySelector('#pvGen')?.addEventListener('click', () => { close(); openGenModal(t.id); });
}

/* ---------- 新建空白模板 ---------- */
function createBlank(redraw: () => void): void {
  const name = window.prompt('模板名称', '新建模板');
  if (!name || !name.trim()) return;
  const tpl: TemplateDoc = {
    id: uid('tpl'),
    name: name.trim(),
    category: '其他',
    desc: '自定义空白模板',
    fields: ['项目名称'],
    contentHTML: blankContentHTML(),
    content: '',
    updatedAt: new Date().toISOString().slice(0, 10),
    builtin: false,
  };
  addTemplate(tpl);
  redraw();
  openTplEditor(tpl, redraw);
}

/* ---------- 上传 docx 解析 ---------- */
async function handleUpload(file: File, redraw: () => void): Promise<void> {
  const isDocx = /\.docx$/i.test(file.name);
  if (!isDocx) {
    toast('仅支持解析 .docx 文件；.doc 请另存为 .docx 后上传', 'warn');
    return;
  }
  try {
    toast('正在解析 Word 文件…', 'info');
    const html = await parseDocx(file);
    const baseName = file.name.replace(/\.docx?$/i, '');
    const tpl: TemplateDoc = {
      id: uid('tpl'),
      name: baseName,
      category: '其他',
      desc: `上传自 ${file.name}`,
      fields: Array.from(new Set(Array.from(html.matchAll(/\{([^}]+)\}/g)).map(m => m[1].trim()))),
      contentHTML: normalizeUploadedHtml(html),
      content: '',
      updatedAt: new Date().toISOString().slice(0, 10),
      builtin: false,
    };
    addTemplate(tpl);
    redraw();
    toast('上传成功，已解析为可编辑模板', 'success');
    openTplEditor(tpl, redraw);
  } catch {
    toast('文件解析失败，请确认是有效的 .docx 文档', 'warn');
  }
}

/** 把 mammoth 输出的 {字段} 文本转换为字段标签，并收敛图片等外部内容 */
function normalizeUploadedHtml(html: string): string {
  const wrapped = html
    .replace(/<img[^>]*>/gi, '<p style="color:#9AA7B8">[图片]</p>')
    .replace(/\{([^}]+)\}/g, (_m, g: string) =>
      `<span class="tpl-ph" contenteditable="false" data-field="${g.trim()}">{${g.trim()}}</span>`);
  return wrapped || '<p></p>';
}
