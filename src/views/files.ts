// 文件管理器：按「阶段 → 用途」二级目录存储
// 含：总览（搜索/排序/类型筛选/最近tab/批量/列表网格/拖拽上传/预览）+ 单项目按阶段目录浏览
import { getProject, getProjects, updateProject } from '../store';
import { PHASE_META, type PhaseKey, type Project } from '../data/types';
import { USAGE_DIR_LIST } from '../data/mock';
import { esc, icon, toast } from '../ui';
import { fmtDate } from '../lib';
import { openPreview, dataUrlSize } from './preview';

const EXT_COLOR: Record<string, string> = {
  docx: '#2B6CB0',
  xlsx: '#2F855A',
  pdf: '#C53030',
  pptx: '#C05621',
  jpg: '#B7791F',
  png: '#B7791F',
  zip: '#6B46C1',
};

const FILE_TYPE_CFG = {
  doc: ['doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'],
  pdf: ['pdf'],
  img: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
} as const;
type FileCatKey = keyof typeof FILE_TYPE_CFG | 'other';

function extCat(ext: string): FileCatKey {
  const lower = ext.toLowerCase();
  for (const k of ['doc', 'pdf', 'img'] as const) {
    if ((FILE_TYPE_CFG[k] as readonly string[]).includes(lower)) return k;
  }
  return 'other';
}

interface FileLike {
  id: string;
  name: string;
  ext: string;
  size: string;
  updated: string;
  data?: string; // dataURL / 对象存储 URL，存在则支持下载
}

/** 下载单个文件：dataURL 直接用，远程 URL 走 fetch+blob 保证跨域下载 */
async function downloadFile(fl: FileLike): Promise<void> {
  const filename = `${fl.name}.${fl.ext}`;
  try {
    if (fl.data?.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = fl.data;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (fl.data) {
      const resp = await fetch(fl.data);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    toast('该文件为占位记录，未保存实际内容，暂无法下载', 'warn');
  } catch {
    toast('下载失败，请稍后重试', 'warn');
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 把文件读成 dataURL */
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read fail'));
    r.readAsDataURL(file);
  });
}

/** 触发一次文件选择并回调文件列表 */
function pickFiles(accept: string, onFiles: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = true;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const list = Array.from(input.files || []);
    input.remove();
    if (list.length) onFiles(list);
  });
  input.click();
}

/** 统一处理上传：写入指定 stage/folder 或合同附件，返回成功数量，并回调进度 */
async function uploadInto(
  p: Project,
  opts: {
    stage?: PhaseKey;
    folder?: string;
    contract?: boolean;
  },
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const entries: FileLike[] = [];
  const total = files.length;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const dot = f.name.lastIndexOf('.');
    const base = dot > 0 ? f.name.slice(0, dot) : f.name;
    const ext = dot > 0 ? f.name.slice(dot + 1).toLowerCase() : 'bin';
    entries.push({
      id: `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: base,
      ext,
      size: fmtSize(f.size),
      updated: new Date().toISOString().slice(0, 10),
      data: await readAsDataURL(f),
    });
    onProgress?.(i + 1, total);
  }
  if (opts.contract) {
    const cur = p.contract?.files ?? [];
    const mapped = entries.map((e) => ({
      name: `${e.name}.${e.ext}`,
      size: 0,
      uploadedAt: e.updated,
      data: e.data,
    }));
    updateProject(p.id, {
      contract: { ...(p.contract ?? { no: '', name: '', amount: '', signDate: '', payment: '' }), files: cur.concat(mapped) },
    });
  } else if (opts.stage && opts.folder) {
    const dir = { ...(p.filesDir ?? {}) };
    const stageDir = { ...(dir[opts.stage] ?? {}) };
    const folderFiles = (stageDir[opts.folder] || []).concat(entries);
    stageDir[opts.folder] = folderFiles;
    dir[opts.stage] = stageDir;
    updateProject(p.id, { filesDir: dir });
  }
  return entries.length;
}

/** 全项目文件总览：收集所有项目（合同附件 + 阶段目录）的全部文件 */
interface Flat {
  uid: string;
  name: string;
  ext: string;
  size: string;
  bytes?: number;
  updated: string;
  data?: string;
  projectId: string;
  projectName: string;
  kind: 'ct' | 'dir';
  stage?: PhaseKey;
  stageName?: string;
  folder?: string;
  ctFile?: { name: string; size: number; uploadedAt: string; data?: string };
}

/** 二次确认浮层 */
function confirmFloat(anchor: HTMLElement, title: string, onOk: () => void): void {
  document.querySelectorAll('[data-confirm-pop]').forEach(el => el.remove());
  const pop = document.createElement('div');
  pop.setAttribute('data-confirm-pop', '');
  pop.className = 'fixed z-[70] w-64 rounded-lg bg-white border border-hair shadow-[0_12px_32px_rgba(43,58,74,0.18)] p-3 text-[13px]';
  pop.innerHTML = `
    <div class="flex items-start gap-2 text-ink">
      <span class="mt-0.5 text-[#E36C0A]">${icon('alert', 15)}</span>
      <div class="flex-1 leading-snug">${title}</div>
    </div>
    <div class="flex justify-end gap-2 mt-3">
      <button class="btn py-1 px-3 text-[12px]" data-pop-cancel>取消</button>
      <button class="py-1 px-3 text-[12px] rounded-md text-white bg-[#C00000] hover:bg-[#A80000] transition-colors" data-pop-ok>确认删除</button>
    </div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.right - pw;
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
  if (left < 8) left = 8;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  const remove = (): void => { pop.remove(); document.removeEventListener('mousedown', onDoc, true); document.removeEventListener('keydown', onKey, true); };
  pop.querySelector('[data-pop-ok]')?.addEventListener('click', () => { remove(); onOk(); });
  pop.querySelector('[data-pop-cancel]')?.addEventListener('click', remove);
  const onDoc = (ev: MouseEvent): void => { if (!pop.contains(ev.target as Node)) remove(); };
  const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') remove(); };
  setTimeout(() => { document.addEventListener('mousedown', onDoc, true); document.addEventListener('keydown', onKey, true); }, 0);
}

/** 把匹配关键词转成高亮 HTML */
function hl(text: string, kw: string): string {
  const t = esc(text);
  if (!kw) return t;
  const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp(`(${safe})`, 'gi');
    return t.replace(re, '<mark class="bg-amber-100 text-inherit px-0.5 rounded">$1</mark>');
  } catch {
    return t;
  }
}

// ===================== 全局文件总览 =====================
export function renderAllFiles(root: HTMLElement, projects: Project[]): void {
  // 全项目收集
  const collectAll = (): Flat[] => {
    const out: Flat[] = [];
    projects.forEach(pr => {
      (pr.contract?.files ?? []).forEach(f => {
        const idx = out.length;
        out.push({
          uid: `${pr.id}-ct-${idx}`,
          name: f.name.replace(/\.[^.]+$/, ''),
          ext: f.name.match(/\.([^.]+)$/)?.[1] ?? 'bin',
          size: f.size ? fmtSize(f.size) : '—',
          bytes: f.size,
          updated: f.uploadedAt,
          data: f.data,
          projectId: pr.id,
          projectName: pr.name,
          kind: 'ct',
          ctFile: f,
        });
      });
      (Object.keys(pr.filesDir ?? {}) as PhaseKey[]).forEach(st => {
        const stageName = PHASE_META[st]?.name ?? st;
        (Object.keys(pr.filesDir?.[st] ?? {})).forEach(folder => {
          ((pr.filesDir?.[st]?.[folder] ?? []) as FileLike[]).forEach(fl => {
            out.push({
              uid: fl.id,
              name: fl.name,
              ext: fl.ext,
              size: fl.size,
              updated: fl.updated,
              data: fl.data,
              projectId: pr.id,
              projectName: pr.name,
              kind: 'dir',
              stage: st,
              stageName,
              folder,
            });
          });
        });
      });
    });
    return out;
  };

  const removeFlat = (flat: Flat): void => {
    const pr = getProject(flat.projectId);
    if (!pr) return;
    if (flat.kind === 'ct' && flat.ctFile) {
      const files = (pr.contract?.files ?? []).filter(f => f !== flat.ctFile);
      const base = pr.contract ?? { no: '', name: '', amount: '', signDate: '', payment: '' };
      updateProject(pr.id, { contract: { no: base.no, name: base.name, amount: base.amount, signDate: base.signDate, payment: base.payment, files } });
    } else if (flat.kind === 'dir' && flat.stage && flat.folder) {
      const dir = { ...(pr.filesDir ?? {}) };
      const st = { ...(dir[flat.stage] ?? {}) };
      st[flat.folder] = (st[flat.folder] ?? []).filter((x: FileLike) => x.id !== flat.uid);
      dir[flat.stage] = st;
      updateProject(pr.id, { filesDir: dir });
    }
  };

  // 状态
  const st = {
    filterProject: '',
    uploadProject: '',
    q: '',
    cat: '' as '' | FileCatKey,
    tab: '' as '' | '7d' | '30d',
    sortKey: 'updated' as 'name' | 'updated' | 'size' | 'ext',
    sortDir: -1 as 1 | -1,
    view: (localStorage.getItem('pm_files_view') || 'list') as 'list' | 'grid',
    sel: new Set<string>(),
    dropOpen: false,
  };

  const sortVal = (f: Flat): number | string => {
    switch (st.sortKey) {
      case 'name': return f.name.toLowerCase();
      case 'ext': return f.ext;
      case 'size': return st.sortDir === -1 ? -(f.bytes ?? 0) : (f.bytes ?? 0);
      default: return f.updated || '';
    }
  };

  const render = (): void => {
    const kw = st.q.trim().toLowerCase();
    const now = Date.now();
    const cutDays = st.tab === '7d' ? 7 : st.tab === '30d' ? 30 : 0;
    let rows = all.filter(f => {
      if (st.filterProject && f.projectId !== st.filterProject) return false;
      if (st.cat && extCat(f.ext) !== st.cat) return false;
      if (cutDays) {
        const t = new Date(f.updated || '2000-01-01').getTime();
        if (!t || now - t > cutDays * 86400000) return false;
      }
      if (kw) {
        const pool = `${f.name}.${f.ext} ${f.projectName} ${f.stageName ?? ''} ${f.folder ?? ''}`.toLowerCase();
        if (!pool.includes(kw)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const av = sortVal(a), bv = sortVal(b);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      const m = st.sortKey === 'name' || st.sortKey === 'ext' ? cmp : cmp;
      return m * st.sortDir;
    });
    // 可选二次排序：同名按时间降序
    if (st.sortKey === 'name') rows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * st.sortDir);

    // 匹配原因标签
    const reasonOf = (f: Flat): string | '' => {
      if (!kw) return '';
      if (`${f.name}.${f.ext}`.toLowerCase().includes(kw)) return '文件名';
      if (f.projectName.toLowerCase().includes(kw)) return '项目';
      if ((f.stageName ?? '').toLowerCase().includes(kw)) return '阶段';
      if ((f.folder ?? '').toLowerCase().includes(kw)) return '文件夹';
      if (f.ext.toLowerCase().includes(kw)) return '类型';
      return '';
    };

    const selCount = st.sel.size;
    const catBtns = (['', 'doc', 'pdf', 'img', 'other'] as const).map(c => {
      const label = c === '' ? '全部' : c === 'doc' ? '文档' : c === 'pdf' ? 'PDF' : c === 'img' ? '图片' : '其他';
      const on = st.cat === c;
      return `<button class="px-2.5 py-1 rounded-md text-[12px] transition-colors ${on ? 'bg-brand text-white font-medium' : 'text-ink-soft hover:bg-brand-soft'}" data-cat="${c}">${label}</button>`;
    }).join('');

    const tabBtns = ([['', '全部文件'], ['7d', '最近7天'], ['30d', '最近30天']] as const).map(([v, label]) => {
      const on = st.tab === v;
      return `<button class="px-2 py-1.5 text-[13px] transition-colors relative ${on ? 'text-brand font-semibold' : 'text-ink-soft hover:text-ink'}" data-tab="${v}">
        ${label}${on ? '<span class="absolute left-0 right-0 bottom-0 h-0.5 bg-brand rounded-full"></span>' : ''}
      </button>`;
    }).join('');

    const viewBtns = `<div class="flex items-center gap-0.5 border border-line rounded-lg overflow-hidden">
      <button class="px-2 py-1.5 ${st.view === 'list' ? 'bg-brand-light text-brand-deep' : 'text-ink-soft hover:bg-brand-soft'}" title="列表视图" data-view="list">${icon('list', 15)}</button>
      <button class="px-2 py-1.5 ${st.view === 'grid' ? 'bg-brand-light text-brand-deep' : 'text-ink-soft hover:bg-brand-soft'}" title="网格视图" data-view="grid">${icon('grid', 15)}</button>
    </div>`;

    // 排序表头
    const sortTh = (label: string, key: 'name' | 'updated' | 'size' | 'ext'): string => {
      const arrow = st.sortKey === key ? (st.sortDir === -1 ? '▼' : '▲') : '';
      const arrowCls = st.sortKey === key ? 'text-brand' : 'text-ink-faint';
      return `<th class="py-2 px-3 font-medium cursor-pointer select-none hover:text-brand transition-colors" data-sort="${key}">${label} <span class="${arrowCls} text-[10px]">${arrow}</span></th>`;
    };

    const fmtUpdated = (f: Flat): string => (f.updated ? fmtDate(f.updated) : '—');
    const sizeOf = (f: Flat): string => f.bytes ? fmtSize(f.bytes) : f.size;
    const dlTarget = (f: Flat): FileLike => ({ id: f.uid, name: f.name, ext: f.ext, size: sizeOf(f), updated: f.updated, data: f.data });

    const projectSelect = `<select id="allProjFilter" class="input w-44 max-w-[10rem]">${[
      `<option value="">全部项目</option>`,
      ...projects.map(pr => `<option value="${pr.id}" ${st.filterProject === pr.id ? 'selected' : ''}>${esc(pr.name)}</option>`),
    ].join('')}</select>`;

    // 行渲染（列表）
    const rowHtml = (f: Flat): string => {
      const c = EXT_COLOR[f.ext] ?? '#6B7A90';
      const reason = reasonOf(f);
      const checked = st.sel.has(f.uid);
      return `<tr class="hover:bg-canvas/60 transition-colors" data-uid="${esc(f.uid)}" data-proj="${f.projectId}">
        <td class="py-2 px-3 w-8"><input type="checkbox" data-sel="${esc(f.uid)}" class="all-sel accent-[#5B9BD5]" ${checked ? 'checked' : ''} /></td>
        <td class="py-2 px-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-8 rounded flex items-center justify-center text-white text-[10px] font-semibold shrink-0" style="background:${c}">${f.ext.toUpperCase()}</span>
            <div class="min-w-0">
              <button class="text-[13px] text-ink truncate max-w-[200px] hover:text-brand-deep transition-colors" title="预览 / 下载" data-all-pv="${esc(f.uid)}">${hl(`${f.name}.${f.ext}`, kw)}</button>
              <div class="text-[10px] text-ink-faint truncate max-w-[200px]">${hl(f.projectName, kw)}${st.filterProject ? '' : ''}</div>
            </div>
          </div>
        </td>
        <td class="py-2 px-3 text-[12px] text-ink-soft whitespace-nowrap">${hl(f.projectName, kw)}</td>
        <td class="py-2 px-3 text-[12px] text-ink-soft whitespace-nowrap">${(f.stageName ? hl(f.stageName, kw) + ' / ' : '')}${f.folder ? hl(f.folder, kw) : '合同'}</td>
        <td class="py-2 px-3 text-[12px] text-ink-soft whitespace-nowrap">${f.updated ? fmtDate(f.updated) : '—'}</td>
        <td class="py-2 px-3 text-[12px] text-ink-soft whitespace-nowrap">${sizeOf(f)}</td>
        <td class="py-2 px-3">
          ${reason ? `<span class="inline-block px-1.5 py-0.5 rounded bg-brand-soft text-brand-deep text-[10px] leading-none">${reason}</span>` : ''}
        </td>
        <td class="py-2 px-3 text-right whitespace-nowrap">
          <button class="btn-ghost px-1.5 text-brand-deep" title="下载" data-all-dl="${esc(f.uid)}">${icon('download', 14)}</button>
          <button class="btn-ghost px-1.5 text-[#C00000]" title="删除" data-all-del="${esc(f.uid)}">${icon('trash', 14)}</button>
        </td>
      </tr>`;
    };

    const gridHtml = (f: Flat): string => {
      const c = EXT_COLOR[f.ext] ?? '#6B7A90';
      const checked = st.sel.has(f.uid);
      const isImg = extCat(f.ext) === 'img';
      const thumb = isImg && f.data && f.data.startsWith('data:image/')
        ? `<img src="${f.data}" alt="" class="w-full h-24 object-contain bg-canvas/40" />`
        : `<div class="w-full h-24 flex items-center justify-center" style="background:${c}26"><span class="text-2xl font-bold text-white" style="color:${c}">${f.ext.toUpperCase()}</span></div>`;
      return `<div class="card overflow-hidden group hover:shadow-sm transition-shadow relative" data-uid="${esc(f.uid)}">
        <div class="absolute top-2 left-2 z-10"><input type="checkbox" data-sel="${esc(f.uid)}" class="all-sel accent-[#5B9BD5]" ${checked ? 'checked' : ''} /></div>
        ${thumb}
        <div class="p-2.5 space-y-1">
          <button class="text-[12.5px] text-ink truncate w-full text-left hover:text-brand-deep transition-colors" title="预览/下载" data-all-pv="${esc(f.uid)}">${hl(`${f.name}.${f.ext}`, kw)}</button>
          <div class="text-[10.5px] text-ink-faint truncate">${hl(f.projectName, kw)} · ${sizeOf(f)}</div>
          <div class="text-[10.5px] text-ink-faint truncate">${(f.stageName ? hl(f.stageName, kw) + ' / ' : '')}${f.folder ? hl(f.folder, kw) : '合同'}</div>
          <div class="flex items-center justify-between pt-1">
            <button class="btn-ghost px-1.5 text-brand-deep" title="下载" data-all-dl="${esc(f.uid)}">${icon('download', 14)}</button>
            <button class="btn-ghost px-1.5 text-[#C00000]" title="删除" data-all-del="${esc(f.uid)}">${icon('trash', 14)}</button>
          </div>
        </div>
      </div>`;
    };

    const cards = rows.length
      ? `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 p-3">${rows.map(gridHtml).join('')}</div>`
      : `<div class="px-4 py-10 text-center text-[12px] text-ink-faint">没有匹配的文件</div>`;

    const tableBody = rows.length
      ? rows.map(rowHtml).join('')
      : `<tr><td colspan="7" class="px-4 py-8 text-center text-[12px] text-ink-faint">没有匹配的文件</td></tr>`;

    const dropZoneOpen = st.dropOpen ? '' : 'hidden';
    const upText = ctx.upText;

    root.innerHTML = `
    <div class="max-w-[1200px] mx-auto space-y-3 view-enter">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('folder', 17)} 文件管理</div>
        <span class="badge-proto text-[11px] text-ink-faint">全部项目 · 共 ${all.length} 个文件</span>
        <div class="flex-1"></div>
        <button class="btn px-2 py-1 text-[12px]" data-toggle-drop>${st.dropOpen ? icon('chevron-up', 13) + ' 收起上传' : icon('upload', 13) + ' 上传'}${ctx.uploading ? ` (${ctx.uploading})` : ''}</button>
        ${viewBtns}
      </div>

      <div id="dropZone" class="${dropZoneOpen}">
        <div class="border-2 border-dashed border-line rounded-xl px-6 py-8 text-center transition-colors cursor-pointer" data-drop-target>
          <div class="text-ink-faint mb-1">${icon('upload', 22)}</div>
          <div class="text-[13px] text-ink-soft">拖拽文件到此处上传，或点击选择文件</div>
        <div class="text-[11px] text-ink-faint mt-1">请先选择上传所属项目，文件将保存到该项目的合同附件</div>
        </div>
        <div class="mt-2 flex items-center gap-2">
        <label class="text-[12px] text-ink-soft whitespace-nowrap" for="uploadProject">上传到项目</label>
        <select id="uploadProject" class="input w-72 max-w-full">
          <option value="">请选择项目</option>
          ${projects.map(pr => `<option value="${pr.id}" ${st.uploadProject === pr.id ? 'selected' : ''}>${esc(pr.name)}（${esc(pr.code)}）</option>`).join('')}
        </select>
        </div>
        ${ctx.uploading ? `
        <div class="mt-2 card p-3 space-y-2">
          <div class="flex justify-between text-[12px] text-ink-soft"><span>${ctx.upMsg}</span><span>${ctx.upDone}/${ctx.upTotal}</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${ctx.upPercent}%"></div></div>
        </div>` : ''}
      </div>

      <div class="flex items-center gap-1.5 border-b border-line pb-2">
        ${tabBtns}
        <div class="flex-1"></div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${catBtns}
          <div class="relative">
            <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">${icon('search', 14)}</span>
            <input id="allFileSearch" class="input pl-8 w-48" placeholder="搜文件名/项目/阶段/类型" value="${esc(st.q)}" />
          </div>
          ${projectSelect}
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        ${selCount ? `<span class="text-[12px] text-brand-deep font-medium">已选 ${selCount} 个</span>` : ''}
        <button class="btn-sm ${selCount ? '' : 'opacity-40 pointer-events-none'}" data-batch-dl>${icon('download', 12)} 批量下载</button>
        <button class="btn-sm ${selCount ? '!text-[#C00000]' : 'opacity-40 pointer-events-none'}" data-batch-del>${icon('trash', 12)} 批量删除</button>
      </div>

      ${st.view === 'grid'
        ? `<div class="card overflow-hidden">${cards}</div>`
        : `<div class="card overflow-hidden">
          <table class="w-full">
            <thead class="bg-canvas/50">
              <tr class="text-left text-[12px] text-ink-faint border-b border-line">
                <th class="py-2 px-3 w-8"><input type="checkbox" id="allSelectAll" class="all-sel accent-[#5B9BD5]" /></th>
                ${sortTh('文件名', 'name')}
                <th class="py-2 px-3 font-medium">所属项目</th>
                <th class="py-2 px-3 font-medium">位置</th>
                ${sortTh('上传时间', 'updated')}
                ${sortTh('文件大小', 'size')}
                ${sortTh('类型', 'ext')}
                <th class="py-2 px-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>`}
    </div>`;

    // ---- 事件绑定 ----
    const search = root.querySelector('#allFileSearch') as HTMLInputElement;
    const projSel = root.querySelector('#allProjFilter') as HTMLSelectElement;
    search?.addEventListener('input', () => { st.q = search.value; render(); });
    projSel?.addEventListener('change', () => { st.filterProject = projSel.value; render(); });

    root.querySelector<HTMLElement>('[data-toggle-drop]')?.addEventListener('click', () => { st.dropOpen = !st.dropOpen; render(); });

    root.querySelectorAll<HTMLElement>('[data-cat]').forEach(b => {
      b.addEventListener('click', () => { st.cat = b.getAttribute('data-cat') as typeof st.cat; render(); });
    });
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => {
      b.addEventListener('click', () => { st.tab = b.getAttribute('data-tab') as typeof st.tab; render(); });
    });
    root.querySelectorAll<HTMLElement>('[data-view]').forEach(b => {
      b.addEventListener('click', () => {
        st.view = (b.getAttribute('data-view') as 'list' | 'grid');
        localStorage.setItem('pm_files_view', st.view);
        render();
      });
    });
    root.querySelectorAll<HTMLElement>('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort') as typeof st.sortKey;
        if (st.sortKey === key) st.sortDir = st.sortDir === -1 ? 1 : -1;
        else { st.sortKey = key; st.sortDir = st.sortKey === 'name' || st.sortKey === 'ext' ? 1 : -1; }
        render();
      });
    });

    // 全选 / 单选状态
    const updateAll = (): void => {
      const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('.all-sel[data-sel]'));
      const checked = boxes.filter(b => b.checked).length;
      const selAll = root.querySelector('#allSelectAll') as HTMLInputElement;
      if (selAll) { selAll.checked = checked === boxes.length && boxes.length > 0; selAll.indeterminate = checked > 0 && checked < boxes.length; }
    };
    root.querySelectorAll<HTMLInputElement>('.all-sel[data-sel]').forEach(b => {
      b.addEventListener('change', () => {
        const uid = b.getAttribute('data-sel') ?? '';
        if (b.checked) st.sel.add(uid); else st.sel.delete(uid);
        updateAll();
      });
    });
    root.querySelector('#allSelectAll')?.addEventListener('change', (e) => {
      const on = (e.target as HTMLInputElement).checked;
      root.querySelectorAll<HTMLInputElement>('.all-sel[data-sel]').forEach(b => {
        b.checked = on;
        const uid = b.getAttribute('data-sel') ?? '';
        if (on) st.sel.add(uid); else st.sel.delete(uid);
      });
      updateAll();
    });

    // 单个删除
    root.querySelectorAll<HTMLElement>('[data-all-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const flat = all.find(f => f.uid === (btn.getAttribute('data-all-del') ?? ''));
        if (!flat) return;
        confirmFloat(btn, `确定删除文件 ${flat.name}.${flat.ext} 吗？此操作不可恢复。`, () => {
          removeFlat(flat); st.sel.delete(flat.uid);
          toast(`已删除 ${flat.name}.${flat.ext}`, 'success');
        });
      });
    });
    // 单个下载
    root.querySelectorAll<HTMLElement>('[data-all-dl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const flat = all.find(f => f.uid === (btn.getAttribute('data-all-dl') ?? ''));
        if (flat) void downloadFile(dlTarget(flat));
      });
    });
    // 单个预览
    root.querySelectorAll<HTMLElement>('[data-all-pv]').forEach(btn => {
      btn.addEventListener('click', () => {
        const flat = all.find(f => f.uid === (btn.getAttribute('data-all-pv') ?? ''));
        if (!flat) return;
        openPreview({
          name: `${flat.name}.${flat.ext}`,
          ext: flat.ext,
          data: flat.data,
          size: flat.bytes ?? (flat.data ? dataUrlSize(flat.data) : undefined),
          onDownload: () => void downloadFile(dlTarget(flat)),
        });
      });
    });

    // 批量下载（逐个）
    root.querySelector('[data-batch-dl]')?.addEventListener('click', () => {
      const flats = all.filter(f => st.sel.has(f.uid));
      if (!flats.length) return;
      flats.forEach(f => void downloadFile(dlTarget(f)));
      toast(`开始下载 ${flats.length} 个文件`, 'success');
    });
    // 批量删除
    root.querySelector('[data-batch-del]')?.addEventListener('click', (e) => {
      const flats = all.filter(f => st.sel.has(f.uid));
      if (!flats.length) return;
      confirmFloat(e.target as HTMLElement, `确定删除选中的 ${flats.length} 个文件吗？此操作不可恢复。`, () => {
        flats.forEach(f => { removeFlat(f); st.sel.delete(f.uid); });
        toast(`已删除 ${flats.length} 个文件`, 'success');
      });
    });

    // 拖拽上传
    const dz = root.querySelector('[data-drop-target]') as HTMLElement | null;
    const uploadProject = root.querySelector('#uploadProject') as HTMLSelectElement | null;
    uploadProject?.addEventListener('change', () => {
      st.uploadProject = uploadProject.value;
    });
    if (dz) {
      const targetProject = st.uploadProject ? getProject(st.uploadProject) : undefined;
      dz.addEventListener('click', () => {
        pickFiles('.doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.png,.gif', async (files) => {
          await runDropUpload(targetProject, files);
        });
      });
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('!border-brand', 'bg-brand-soft/60'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('!border-brand', 'bg-brand-soft/60'));
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('!border-brand', 'bg-brand-soft/60');
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length) void runDropUpload(targetProject, files);
      });
    }
  };

  // 上传上下文（进度条状态）
  const ctx: { uploading: boolean; upMsg: string; upDone: number; upTotal: number; upPercent: number; upText: string } =
    { uploading: false, upMsg: '', upDone: 0, upTotal: 0, upPercent: 0, upText: '' };

  const runDropUpload = async (target: Project | undefined, files: File[]): Promise<void> => {
    if (!target) { toast('请先选择上传所属项目', 'warn'); return; }
    ctx.uploading = true;
    ctx.upTotal = files.length;
    ctx.upDone = 0;
    ctx.upMsg = '上传中...';
    ctx.upText = `上传中...`;
    ctx.upPercent = 0;
    render();
    await uploadInto(target, { contract: true }, files, (done, total) => {
      ctx.upDone = done; ctx.upTotal = total;
      ctx.upPercent = Math.round((done / total) * 100);
      ctx.upText = `上传中 (${done}/${total})`;
      render();
    });
    ctx.uploading = false;
    toast(`已上传 ${files.length} 个文件至「${target.name}」`, 'success');
    render();
  };

  const all = collectAll();
  render();
}

// ===================== 单项目文件管理器 =====================
export function renderFiles(root: HTMLElement, projectId?: string): void {
  const projects = getProjects();
  // 一级菜单进入（无 projectId）：展示所有项目全部文件总览
  if (!projectId || !getProject(projectId)) {
    renderAllFiles(root, projects);
    return;
  }
  const pid = projectId && getProject(projectId) ? projectId : projects[0].id;
  const p = getProject(pid);
  if (!p) {
    root.innerHTML = `<div class="card p-10 text-center text-ink-faint">未找到项目</div>`;
    return;
  }
  const projRef = p;

  const render = (selStage: PhaseKey, selFolder?: string): void => {
    const folders = USAGE_DIR_LIST.find(u => u.stage === selStage)?.folders ?? [];
    const dir = p.filesDir[selStage] ?? {};

    const stageList = USAGE_DIR_LIST.map(u => {
      const m = PHASE_META[u.stage];
      const cnt = (u.folders ?? []).reduce(
        (acc, f) => acc + ((p.filesDir[u.stage]?.[f] ?? []) as unknown[]).length,
        0,
      );
      const active = u.stage === selStage;
      return `<button class="ft-cell flex items-center gap-2 px-3 py-2 rounded-md text-[13px] transition-colors text-left ${active ? 'bg-brand-light text-brand-deep font-medium' : 'text-ink-soft hover:bg-brand-soft'}"
        data-stage="${u.stage}">
        <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${m.color}"></span>
        <span class="flex-1">${m.name}</span>
        <span class="text-[11px] text-ink-faint">${cnt}</span>
      </button>`;
    }).join('');

    const folderCards = folders
      .map(f => {
        const files = (dir[f] ?? []) as FileLike[];
        const fileRows =
          files
            .map(fl => {
              const c = EXT_COLOR[fl.ext] ?? '#6B7A90';
              return `<div class="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-brand-soft transition-colors group" data-dl="${fl.id}">
                <span class="w-7 h-8 rounded flex items-center justify-center text-white text-[10px] font-semibold shrink-0" style="background:${c}">${fl.ext.toUpperCase()}</span>
                <button class="flex-1 min-w-0 text-left group/pv" title="预览 / 下载" data-pv-file="${fl.id}">
                  <div class="text-[13px] text-ink truncate group-hover/pv:text-brand-deep transition-colors">${esc(fl.name)}.${esc(fl.ext)}</div>
                  <div class="text-[10px] text-ink-faint">${fl.size} · ${fmtDate(fl.updated)}</div>
                </button>
                <button class="text-danger/70 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="删除" data-del-file="${fl.id}">${icon('trash', 14)}</button>
                <span class="text-brand-deep shrink-0" title="下载" data-dl-file="${fl.id}">${icon('download', 14)}</span>
              </div>`;
            })
            .join('') ||
          `<div class="px-3 py-4 text-[12px] text-ink-faint text-center">（空目录）</div>`;
        return `<div class="card overflow-hidden">
          <div class="px-3 py-2.5 border-b border-hair flex items-center gap-2 bg-canvas/40">
            ${icon('folder', 15)} <span class="text-[13px] font-medium text-ink">${esc(f)}</span>
            <button class="btn py-0.5 px-2 text-[11px] ml-auto" data-up-folder data-stage="${selStage}" data-folder="${f}">${icon('upload', 11)} 上传</button>
            <span class="text-[11px] text-ink-faint">${files.length}</span>
          </div>
          <div class="p-1.5 space-y-0.5 bg-white">${fileRows}</div>
        </div>`;
      })
      .join('');

    // 合同附件区块
    const ctFiles = (p.contract?.files ?? []).map(f => ({
      id: `ct-${f.name}-${f.uploadedAt}`,
      name: f.name.replace(/\.[^.]+$/, ''),
      ext: (f.name.match(/\.([^.]+)$/)?.[1] ?? 'bin'),
      size: f.size ? fmtSize(f.size) : '—',
      updated: f.uploadedAt,
      data: f.data,
    }));
    const ctCard = `<div class="card overflow-hidden">
      <div class="px-3 py-2.5 border-b border-hair flex items-center gap-2 bg-brand-soft/60">
        ${icon('doc', 15)} <span class="text-[13px] font-medium text-ink">合同附件</span>
        <button class="btn py-0.5 px-2 text-[11px] ml-auto" data-up-ct>${icon('upload', 11)} 上传</button>
        <span class="text-[11px] text-ink-faint">${ctFiles.length}</span>
      </div>
      <div class="p-1.5 space-y-0.5 bg-white">${
        ctFiles.map(fl => {
          const c = EXT_COLOR[fl.ext] ?? '#6B7A90';
          return `<div class="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-brand-soft transition-colors group" data-dl="${fl.id}">
            <span class="w-7 h-8 rounded flex items-center justify-center text-white text-[10px] font-semibold shrink-0" style="background:${c}">${fl.ext.toUpperCase()}</span>
            <button class="flex-1 min-w-0 text-left group/pv" data-pv-ct="${fl.id}">
              <div class="text-[13px] text-ink truncate group-hover/pv:text-brand-deep transition-colors">${esc(fl.name)}.${esc(fl.ext)}</div>
              <div class="text-[10px] text-ink-faint">${fl.size} · ${fmtDate(fl.updated)}</div>
            </button>
            <button class="text-danger/70 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="删除" data-del-ct-item="${fl.id}">${icon('trash', 14)}</button>
            <span class="text-brand-deep shrink-0" title="下载" data-dl-ct="${fl.id}">${icon('download', 14)}</span>
          </div>`;
        }).join('') ||
        `<div class="px-3 py-4 text-[12px] text-ink-faint text-center">（暂无合同附件）</div>`
      }
      </div>
    </div>`;

    const filesGrid = `${ctCard}${folderCards}`;

    // 面包屑：全部文件 > 项目 > 阶段 > 文件夹
    const crumb = (href: string, label: string, current = false): string => {
      const c = current ? 'text-ink-soft font-medium no-underline cursor-default' : 'text-brand-deep hover:underline cursor-pointer';
      return `<a href="${href}" class="${c}">${esc(label)}</a>`;
    };
    const breadcrumb = `<nav class="flex items-center gap-1.5 text-[12px]">
      ${crumb('#/files', '全部文件')}
      <span class="text-ink-faint">›</span>
      ${crumb(`#/project/${pid}`, p.name)}
      <span class="text-ink-faint">›</span>
      ${crumb(`#/files/${pid}`, PHASE_META[selStage].name, true)}
      ${selFolder ? `<span class="text-ink-faint">›</span><span class="text-ink-soft">${esc(selFolder)}</span>` : ''}
    </nav>`;

    root.innerHTML = `
    <div class="max-w-[1200px] mx-auto space-y-3 view-enter">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('folder', 17)} 文件管理器</div>
        <select id="ftProject" class="input w-64">${projects
          .map(pr => `<option value="${pr.id}" ${pr.id === pid ? 'selected' : ''}>${esc(pr.name)}</option>`)
          .join('')}</select>
      </div>

      ${breadcrumb}

      <!-- 拖拽上传区（可折叠） -->
      <div class="card p-3" id="projDropWrap">
        <button class="flex items-center gap-1.5 text-[12px] text-ink-soft hover:text-ink transition-colors" data-toggle-projdrop>${icon('chevron-down', 12)} 拖拽上传到「${PHASE_META[selStage].name}」</button>
        <div id="projDropZone" class="mt-2 hidden">
          <div class="border-2 border-dashed border-line rounded-lg px-6 py-5 text-center transition-colors cursor-pointer" data-proj-drop>
            <div class="text-[13px] text-ink-soft">拖拽文件到此处，或点击选择文件，上传到「${PHASE_META[selStage].name}」的「${folders[0] ?? '合同文件'}」</div>
          </div>
          <div class="progress-track mt-2 ${ctx.uploading ? '' : 'hidden'}" id="projProgTrack"><div class="progress-fill" id="projProgFill" style="width:${ctx.upPercent}%"></div></div>
          <div class="text-[11px] text-ink-faint mt-1 ${ctx.uploading ? '' : 'hidden'}" id="projProgText">${ctx.upText || '上传中...'}</div>
        </div>
      </div>

      <div class="flex items-stretch">
        <div class="w-52 shrink-0 border rounded-lg bg-white p-2 space-y-0.5">${stageList}</div>
        <div class="flex-1 min-w-0 pl-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">${filesGrid}</div>
        </div>
      </div>
    </div>`;

    root.querySelectorAll<HTMLElement>('.ft-cell').forEach(el => {
      el.addEventListener('click', () => {
        render(el.getAttribute('data-stage') as PhaseKey);
      });
    });
    const sel = root.querySelector('#ftProject') as HTMLSelectElement | null;
    sel?.addEventListener('change', () => {
      window.location.hash = `#/files/${sel.value}`;
    });

    // 单项目上传上下文
    const ctl = {
      track: root.querySelector('#projProgTrack') as HTMLElement,
      fill: root.querySelector('#projProgFill') as HTMLElement,
      text: root.querySelector('#projProgText') as HTMLElement,
      open: false,
    };
    const showCtx = (): void => {
      if (ctl.track) ctl.track.classList.toggle('hidden', !ctx.uploading);
      if (ctl.text) ctl.text.classList.toggle('hidden', !ctx.uploading);
      if (ctl.fill) ctl.fill.style.width = `${ctx.upPercent}%`;
      if (ctl.text) ctl.text.textContent = ctx.upText || '上传中...';
    };

    root.querySelector<HTMLElement>('[data-toggle-projdrop]')?.addEventListener('click', () => {
      const zone = root.querySelector('#projDropZone') as HTMLElement;
      if (zone) zone.classList.toggle('hidden');
    });
    const pdz = root.querySelector<HTMLElement>('[data-proj-drop]');
    if (pdz) {
      pdz.addEventListener('click', () => {
        pickFiles('.doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.png,.gif', async (files) => {
          const target = folders[0] ?? '';
          await runProjUpload(files, target);
        });
      });
      pdz.addEventListener('dragover', (e) => { e.preventDefault(); pdz.classList.add('!border-brand', 'bg-brand-soft/60'); });
      pdz.addEventListener('dragleave', () => pdz.classList.remove('!border-brand', 'bg-brand-soft/60'));
      pdz.addEventListener('drop', (e) => {
        e.preventDefault();
        pdz.classList.remove('!border-brand', 'bg-brand-soft/60');
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length) void runProjUpload(files, folders[0] ?? '');
      });
    }

    async function runProjUpload(files: File[], folder: string): Promise<void> {
      ctx.uploading = true;
      ctx.upTotal = files.length;
      ctx.upDone = 0;
      ctx.upPercent = 0;
      ctx.upText = `上传中 (0/${files.length})`;
      showCtx();
      await uploadInto(projRef, { stage: selStage, folder }, files, (done, total) => {
        ctx.upDone = done; ctx.upTotal = total;
        ctx.upPercent = Math.round((done / total) * 100);
        ctx.upText = `上传中 (${done}/${total})`;
        showCtx();
      });
      ctx.uploading = false;
      toast(`已上传 ${files.length} 个文件至「${folder}」`, 'success');
      render(selStage, folder);
    }

    // 预览：目录内文件
    const findDirFile = (id: string): FileLike | undefined => {
      for (const folder of Object.values(p.filesDir)) {
        const f = (Object.values(folder).flat() as FileLike[]).find(x => x.id === id);
        if (f) return f;
      }
      return undefined;
    };
    root.querySelectorAll<HTMLElement>('[data-pv-file]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const fl = findDirFile(el.getAttribute('data-pv-file') ?? '');
        if (!fl) { toast('文件不存在或已被移除', 'warn'); return; }
        openPreview({ name: `${fl.name}.${fl.ext}`, ext: fl.ext, data: fl.data, size: fl.data ? dataUrlSize(fl.data) : undefined, onDownload: () => void downloadFile(fl) });
      });
    });
    root.querySelectorAll<HTMLElement>('[data-dl-file]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const fl = findDirFile(el.getAttribute('data-dl-file') ?? '');
        if (fl) void downloadFile(fl);
      });
    });

    // 预览：合同附件
    const findCtFile = (id: string): FileLike | undefined =>
      (p.contract?.files ?? []).map((f) => ({
        id: `ct-${f.name}-${f.uploadedAt}`,
        name: f.name.replace(/\.[^.]+$/, ''),
        ext: f.name.match(/\.([^.]+)$/)?.[1] ?? 'bin',
        size: '—',
        updated: f.uploadedAt,
        data: f.data,
      })).find(x => x.id === id);
    root.querySelectorAll<HTMLElement>('[data-pv-ct]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const fl = findCtFile(el.getAttribute('data-pv-ct') ?? '');
        if (!fl) { toast('附件不存在或已被移除', 'warn'); return; }
        openPreview({ name: `${fl.name}.${fl.ext}`, ext: fl.ext, data: fl.data, size: fl.data ? dataUrlSize(fl.data) : undefined, onDownload: () => void downloadFile(fl) });
      });
    });

    // 下载：目录内文件（点击行）
    root.querySelectorAll<HTMLElement>('[data-dl]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const target = el.getAttribute('data-dl');
        const fl = findDirFile(target ?? '');
        if (fl) { void downloadFile(fl); return; }
        toast('文件不存在或已被移除', 'warn');
      });
    });

    // 下载：合同附件
    root.querySelectorAll<HTMLElement>('[data-dl-ct]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = el.getAttribute('data-dl-ct') ?? el.getAttribute('data-dl');
        const fl = findCtFile(id ?? '');
        if (fl) void downloadFile(fl);
      });
    });

    // 上传：目录
    root.querySelectorAll<HTMLElement>('[data-up-folder]').forEach(el => {
      el.addEventListener('click', () => {
        const stage = el.getAttribute('data-stage') as PhaseKey;
        const folder = el.getAttribute('data-folder') ?? '';
        pickFiles('.doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.zip', async (files) => {
          await uploadInto(p, { stage, folder }, files, (done, total) => {
            ctx.uploading = true; ctx.upDone = done; ctx.upTotal = total;
            ctx.upPercent = Math.round((done / total) * 100);
            ctx.upText = `上传中 (${done}/${total})`;
            showCtx();
          });
          ctx.uploading = false;
          toast(`已上传 ${files.length} 个文件至「${folder}」`, 'success');
          render(stage, folder);
        });
      });
    });

    // 上传：合同附件
    root.querySelector<HTMLElement>('[data-up-ct]')?.addEventListener('click', () => {
      pickFiles('.doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.zip', async (files) => {
        await uploadInto(p, { contract: true }, files, (done, total) => {
          ctx.uploading = true; ctx.upDone = done; ctx.upTotal = total;
          ctx.upPercent = Math.round((done / total) * 100);
          ctx.upText = `上传中 (${done}/${total})`;
          showCtx();
        });
        ctx.uploading = false;
        toast(`已上传 ${files.length} 个合同附件`, 'success');
        render(selStage);
      });
    });

    // 删除：目录内文件（内联确认）
    root.querySelectorAll<HTMLElement>('[data-del-file]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute('data-del-file');
        const dir = p.filesDir[selStage] ?? {};
        const folders = Object.keys(dir);
        for (const fld of folders) {
          const list = (dir[fld] ?? []) as FileLike[];
          const fl = list.find(x => x.id === id);
          if (fl) {
            confirmFloat(btn, `确定删除文件 ${fl.name}.${fl.ext} 吗？此操作不可恢复。`, () => {
              const newDir = { ...p.filesDir };
              const stt = { ...(newDir[selStage] ?? {}) };
              stt[fld] = list.filter(x => x.id !== id);
              newDir[selStage] = stt;
              updateProject(p.id, { filesDir: newDir });
              toast(`已删除 ${fl.name}.${fl.ext}`, 'success');
              render(selStage, fld);
            });
            return;
          }
        }
      });
    });

    // 删除：合同附件（内联确认）
    root.querySelectorAll<HTMLElement>('[data-del-ct-item]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute('data-del-ct-item');
        const cur = p.contract?.files ?? [];
        const target = cur.find(f => `ct-${f.name}-${f.uploadedAt}` === id);
        if (target) {
          confirmFloat(btn, `确定删除文件 ${target.name} 吗？此操作不可恢复。`, () => {
            updateProject(p.id, {
              contract: { ...(p.contract ?? { no: '', name: '', amount: '', signDate: '', payment: '' }), files: cur.filter(f => f !== target) },
            });
            toast(`已删除 ${target.name}`, 'success');
            render(selStage);
          });
        }
      });
    });
  };

  const ctx: { uploading: boolean; upMsg: string; upDone: number; upTotal: number; upPercent: number; upText: string } =
    { uploading: false, upMsg: '', upDone: 0, upTotal: 0, upPercent: 0, upText: '' };

  render('initiate');
}