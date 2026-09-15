// 模板富文本编辑器：contenteditable + 工具栏 + 字段占位符插入/改名
import { updateTemplate } from '../store';
import type { TemplateDoc } from '../data/types';
import { FIELD_DEFS, fieldSpan } from './template-doc';
import { fmtDate, todayISO } from '../lib';
import { icon, toast } from '../ui';

const GROUP_ORDER: Array<FieldGroup> = ['基本信息', '合同', '人员', '日期'];
type FieldGroup = '基本信息' | '合同' | '人员' | '日期';

/** 默认富文本（新建模板时） */
export function blankContentHTML(): string {
  return `<h1>模板标题</h1><p>${fieldSpan('项目名称')}</p><p>在此编辑正文，可使用工具栏插入字段占位符与格式。</p>`;
}

export function openTplEditor(tpl: TemplateDoc, onSaved?: () => void): void {
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.style.overflow = 'auto';
  bg.innerHTML = `
  <div class="bg-white rounded-lg w-[900px] max-w-[96vw] mx-auto shadow-xl border border-line flex flex-col" style="max-height:94vh">
    <div class="flex items-center justify-between px-5 py-3 border-b border-hair shrink-0">
      <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('edit', 16)} 编辑模板
        <span class="ml-1 text-[11px] font-normal text-ink-faint bg-canvas/70 px-2 py-0.5 rounded">${escapeText(tpl.name)} · ${escapeText(tpl.category)}</span>
      </div>
      <button class="ed-close btn-ghost">${icon('x', 16)}</button>
    </div>

    <!-- 工具栏 -->
    <div id="edToolbar" class="px-4 py-2 border-b border-hair bg-canvas/40 shrink-0 flex flex-wrap items-center gap-1">
      <button id="edName" class="btn text-[12px] py-1 mr-1" title="修改模板名称/类型">${icon('edit', 13)} ${escapeText(tpl.name)} · ${escapeText(tpl.category)}</button>
      <span class="w-px h-5 bg-line mx-1"></span>
      <button class="tb-btn" data-cmd="bold" title="加粗 (Ctrl+B)"><b>B</b></button>
      <button class="tb-btn" data-cmd="italic" title="斜体 (Ctrl+I)"><i>I</i></button>
      <span class="w-px h-5 bg-line mx-1"></span>
      <button class="tb-btn" data-block="h1" title="大标题">H1</button>
      <button class="tb-btn" data-block="h2" title="小节标题">H2</button>
      <button class="tb-btn" data-block="h3" title="小标题">H3</button>
      <button class="tb-btn" data-block="p" title="正文段落">P</button>
      <span class="w-px h-5 bg-line mx-1"></span>
      <button class="tb-btn px-2 text-[12px]" data-size="2" title="小字号">小</button>
      <button class="tb-btn px-2 text-[12px]" data-size="3" title="正文字号">中</button>
      <button class="tb-btn px-2 text-[12px]" data-size="5" title="大字号">大</button>
      <span class="w-px h-5 bg-line mx-1"></span>
      <button class="tb-btn" data-cmd="insertUnorderedList" title="无序列表">${icon('ul', 16)}</button>
      <button class="tb-btn" data-cmd="insertOrderedList" title="有序列表">${icon('ol', 16)}</button>
      <button class="tb-btn" data-table="1" title="插入表格">${icon('table', 16)}</button>
      <span class="w-px h-5 bg-line mx-1"></span>
      <button id="edInsertField" class="tb-btn text-brand-deep border-brand-light bg-brand-light/60 px-2" title="插入字段占位符">${icon('tag', 14)} 插入字段</button>
      <div class="w-full h-px bg-hair my-1"></div>
      <span class="text-[11px] text-ink-faint ml-1">提示：点击正文中的蓝色字段标签可修改字段名；字段在生成文档时自动替换为项目信息。</span>
    </div>

    <div class="p-4 overflow-auto bg-canvas/50 flex-1">
      <div id="edBody" class="tpl-sheet" contenteditable="true" spellcheck="false">${tpl.contentHTML || textToHtml(tpl.content || '')}</div>
    </div>

    <div class="flex items-center justify-between px-5 py-3 border-t border-hair bg-canvas/40 shrink-0 rounded-b-lg">
      <span class="text-[11px] text-ink-faint">${tpl.builtin ? '预置模板，修改后可恢复需重置数据' : '自定义模板'}</span>
      <div class="flex gap-2">
        <button class="ed-close btn">取消</button>
        <button id="edSave" class="btn-primary">${icon('check', 14)} 保存模板</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(bg);

  const close = () => bg.remove();
  bg.querySelectorAll('.ed-close').forEach(b => b.addEventListener('click', close));
  bg.addEventListener('click', e => { if (e.target === bg) close(); });

  const body = bg.querySelector('#edBody') as HTMLElement;
  const nameBtn = bg.querySelector('#edName') as HTMLButtonElement;

  // 模板名称/类型编辑
  nameBtn.addEventListener('click', () => {
    const nv = window.prompt('模板名称', tpl.name);
    if (nv && nv.trim()) {
      tpl.name = nv.trim();
      updateTemplate(tpl.id, { name: tpl.name });
    }
    const cv = window.prompt('模板类型（如：立项类、方案类、验收类）', tpl.category);
    if (cv && cv.trim()) {
      tpl.category = cv.trim();
      updateTemplate(tpl.id, { category: tpl.category });
    }
    nameBtn.innerHTML = `${icon('edit', 13)} ${escapeText(tpl.name)} · ${escapeText(tpl.category)}`;
  });

  // 格式化命令（阻止工具栏 mousedown 抢走正文选区）
  bg.querySelector('#edToolbar')?.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement).closest('input')) return; // 自定义字段输入框不拦截
    e.preventDefault();
  });
  const exec = (cmd: string, val?: string) => {
    body.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, val);
  };
  bg.querySelectorAll<HTMLElement>('.tb-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd');
      const block = btn.getAttribute('data-block');
      const size = btn.getAttribute('data-size');
      const table = btn.getAttribute('data-table');
      if (cmd) exec(cmd);
      else if (block) exec('formatBlock', block);
      else if (size) exec('fontSize', size);
      else if (table) insertTable(body);
    });
  });

  // 插入字段
  bg.querySelector('#edInsertField')?.addEventListener('click', e => {
    e.preventDefault();
    openFieldPicker(body, bg);
  });

  // 点击字段标签 → 改名
  body.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const ph = target.closest('.tpl-ph') as HTMLElement | null;
    if (ph) renameField(ph);
  });

  // 保存
  bg.querySelector('#edSave')?.addEventListener('click', () => {
    const html = body.innerHTML;
    const fields = Array.from(new Set(Array.from(body.querySelectorAll<HTMLElement>('.tpl-ph')).map(el => el.getAttribute('data-field') || el.textContent || '')));
    updateTemplate(tpl.id, { contentHTML: html, content: htmlToText(html), fields, updatedAt: todayISO() });
    toast('模板已保存', 'success');
    close();
    onSaved?.();
  });
}

function insertTable(body: HTMLElement): void {
  body.focus();
  const table = `<table><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p></p>`;
  document.execCommand('insertHTML', false, table);
}

function openFieldPicker(body: HTMLElement, owner: HTMLElement): void {
  const existing = document.getElementById('fieldPicker');
  if (existing) existing.remove();
  const picker = document.createElement('div');
  picker.id = 'fieldPicker';
  picker.className = 'fixed z-[60] bg-white border border-line rounded-lg shadow-xl w-64 overflow-hidden';
  const groups = GROUP_ORDER.map(g => {
    const items = FIELD_DEFS.filter(f => f.group === g);
    return `<div class="px-2.5 py-1 text-[10px] text-ink-faint bg-canvas/60 border-t border-hair first:border-t-0">${g}</div>
      ${items.map(f => `<button class="fp-item w-full text-left px-3 py-1.5 text-[12px] hover:bg-brand-soft flex items-center gap-1.5" data-field="${escapeText(f.name)}">${icon('tag', 12)} <span class="text-brand-deep">{${escapeText(f.name)}}</span><span class="text-ink-faint text-[10px] ml-auto">${escapeText(f.label)}</span></button>`).join('')}`;
  }).join('');
  picker.innerHTML = `
    <div class="px-3 py-2 text-[12px] font-semibold text-ink border-b border-hair">选择字段插入</div>
    <div class="max-h-64 overflow-auto">${groups}
      <div class="px-2.5 py-1 text-[10px] text-ink-faint bg-canvas/60 border-t border-hair">自定义</div>
      <div class="flex items-center gap-1 p-2 border-t border-hair">
        <input id="fpCustom" class="input flex-1 text-[12px] py-1" placeholder="自定义字段名" />
        <button id="fpCustomOk" class="btn-primary text-[12px] px-2 py-1">插入</button>
      </div>
    </div>`;
  document.body.appendChild(picker);
  // 阻止点击选择器导致正文选区丢失
  picker.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
  });

  // 定位到工具栏按钮下方
  const rect = (owner.querySelector('#edInsertField') as HTMLElement).getBoundingClientRect();
  picker.style.left = `${Math.min(rect.left, window.innerWidth - 270)}px`;
  picker.style.top = `${rect.bottom + 6}px`;

  const insert = (name: string) => {
    body.focus();
    document.execCommand('insertHTML', false, fieldSpan(name) + '&nbsp;');
    picker.remove();
  };
  picker.querySelectorAll<HTMLElement>('.fp-item').forEach(it => {
    it.addEventListener('click', () => insert(it.getAttribute('data-field') || ''));
  });
  const customInput = picker.querySelector('#fpCustom') as HTMLInputElement;
  picker.querySelector('#fpCustomOk')?.addEventListener('click', () => {
    const v = customInput.value.trim().replace(/[{}]/g, '');
    if (v) insert(v);
  });
  customInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = customInput.value.trim().replace(/[{}]/g, '');
      if (v) insert(v);
    }
  });
  const closePicker = (e: Event) => {
    if (!picker.contains(e.target as Node)) {
      picker.remove();
      document.removeEventListener('mousedown', closePicker);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closePicker), 0);
}

function renameField(ph: HTMLElement): void {
  const old = ph.getAttribute('data-field') || ph.textContent?.replace(/[{}]/g, '') || '';
  const v = window.prompt('修改字段名（将作为生成文档时的占位符）', old);
  if (v == null) return;
  const name = v.trim().replace(/[{}]/g, '');
  if (!name || name === old) return;
  ph.setAttribute('data-field', name);
  ph.textContent = `{${name}}`;
}

/** 纯文本（旧模板）转基础 HTML */
export function textToHtml(text: string): string {
  return text
    .split('\n')
    .map(line => {
      if (!line.trim()) return '<p><br></p>';
      const h = escapeText(line).replace(/\{([^}]+)\}/g, (_m, g: string) =>
        fieldSpan(g.trim()),
      );
      const t = line.trim();
      if (/^[一二三四五六七八九十]、/.test(t)) return `<h2>${h}</h2>`;
      if (/^\d+[.、]/.test(t)) return `<p>${h}</p>`;
      return `<p>${h}</p>`;
    })
    .join('');
}

function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll<HTMLElement>('.tpl-ph').forEach(el => {
    el.textContent = `{${el.getAttribute('data-field') || el.textContent || ''}}`;
  });
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtUpdated(iso?: string): string {
  return iso ? fmtDate(iso) : '—';
}
