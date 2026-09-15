// 附件预览模块：图片 / PDF / Office 文档
// - 图片：弹窗内 <img> 直接展示
// - PDF：浏览器内置 iframe 预览（dataURL 或 http 均可）
// - Office：调用微软在线预览服务（需公网可访问 URL）
// - 其余类型：不支持预览，由调用方直接下载

import { esc, icon } from '../ui';

const IMG_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
const PDF_EXTS = ['pdf'];
const OFFICE_EXTS: Record<string, string> = {
  doc: 'Word',
  docx: 'Word',
  xls: 'Excel',
  xlsx: 'Excel',
  ppt: 'PowerPoint',
  pptx: 'PowerPoint',
};

export function isOfficeExt(ext: string): boolean {
  return ext.toLowerCase() in OFFICE_EXTS;
}

/** Office 在线预览：仅当提供 http(s) URL 时可用（微软服务需公网访问） */
function officePreviewUrl(src: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`;
}

export function canPreview(ext: string): boolean {
  const e = ext.toLowerCase();
  return IMG_EXTS.includes(e) || PDF_EXTS.includes(e) || (e in OFFICE_EXTS);
}

/**
 * 打开文件预览弹窗。
 * @param opts.name 文件名（不含扩展名或含皆可）
 * @param opts.ext  扩展名（小写，不含点）
 * @param opts.data 文件内容：dataURL 或 http(s) URL（Office 在线预览仅支持 http URL）
 * @param opts.unsupportedText 不支持预览时的提示文案
 * @param opts.onDownload 不支持类型时的下载回调（调用方可传入自定义下载逻辑）
 */
export function openPreview(opts: {
  name: string;
  ext: string;
  data?: string;
  size?: number;
  unsupportedText?: string;
  onDownload?: () => void;
}): void {
  const ext = opts.ext.toLowerCase();
  const name = opts.name;
  const isImg = IMG_EXTS.includes(ext);
  const sizeLabel = opts.size ? formatSize(opts.size) : '';

  const bg = document.createElement('div');
  bg.className = 'modal-mask pv-mask';
  bg.style.zIndex = '80';
  bg.innerHTML = `
    <div class="modal pv-modal flex flex-col" style="max-width:960px;width:calc(100vw - 48px);height:calc(100vh - 80px);padding:0;overflow:hidden">
      <div class="px-4 py-3 border-b border-line flex items-center justify-between shrink-0 gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-brand-deep shrink-0">${icon('file', 16)}</span>
          <span class="text-[14px] font-semibold text-ink truncate">${esc(name)}</span>
          <span class="badge-proto text-[11px] text-ink-faint uppercase shrink-0">${esc(ext)}</span>
          ${sizeLabel ? `<span class="text-[11px] text-ink-faint shrink-0">${sizeLabel}</span>` : ''}
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${isImg ? `<div class="flex items-center gap-0.5 mr-1">
            <button class="btn-ghost px-2 py-1 text-[16px] leading-none" data-pv-zoom-out title="缩小">−</button>
            <span class="text-[12px] text-ink-soft w-12 text-center" data-pv-zoom-label>100%</span>
            <button class="btn-ghost px-2 py-1 text-[16px] leading-none" data-pv-zoom-in title="放大">＋</button>
            <button class="btn-ghost px-2 py-1 text-[12px]" data-pv-zoom-reset title="还原">重置</button>
          </div>` : ''}
          <button class="btn py-1 px-2.5 text-[12px]" data-pv-download>${icon('download', 13)} 下载</button>
          <button class="btn-ghost px-1.5 text-ink-soft hover:text-ink" data-pv-close title="关闭">${icon('x', 18)}</button>
        </div>
      </div>
      <div class="flex-1 min-h-0 bg-[#F3F6FA] pv-body" data-pv-body></div>
    </div>`;

  const body = bg.querySelector('[data-pv-body]') as HTMLElement;
  const close = (): void => { bg.remove(); document.removeEventListener('keydown', onKey, true); };

  if (isImg) {
    body.innerHTML = `<div class="h-full w-full overflow-auto flex items-center justify-center p-4 pv-img-wrap">
      <img src="${esc(opts.data || '')}" alt="${esc(name)}" class="pv-img max-w-none object-contain rounded shadow-sm bg-white" style="transform:scale(1)" /></div>`;
    const img = body.querySelector<HTMLImageElement>('.pv-img');
    const label = bg.querySelector('[data-pv-zoom-label]') as HTMLElement;
    let scale = 1;
    const apply = (): void => { if (img) img.style.transform = `scale(${scale})`; if (label) label.textContent = `${Math.round(scale * 100)}%`; };
    bg.querySelector('[data-pv-zoom-in]')?.addEventListener('click', () => { scale = Math.min(4, +(scale + 0.2).toFixed(2)); apply(); });
    bg.querySelector('[data-pv-zoom-out]')?.addEventListener('click', () => { scale = Math.max(0.2, +(scale - 0.2).toFixed(2)); apply(); });
    bg.querySelector('[data-pv-zoom-reset]')?.addEventListener('click', () => { scale = 1; apply(); });
    // 滚轮缩放（Ctrl/普通滚轮均可）
    const wrap = body.querySelector<HTMLElement>('.pv-img-wrap');
    wrap?.addEventListener('wheel', (ev: WheelEvent) => {
      ev.preventDefault();
      scale = Math.min(4, Math.max(0.2, +(scale + (ev.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)));
      apply();
    }, { passive: false });
  } else if (PDF_EXTS.includes(ext)) {
    body.innerHTML = `<iframe src="${esc(opts.data || '')}" class="w-full h-full" style="border:0" title="PDF 预览"></iframe>`;
  } else if (ext in OFFICE_EXTS) {
    if (opts.data && /^https?:\/\//.test(opts.data)) {
      body.innerHTML = `
        <div class="h-full w-full overflow-auto bg-[#E7EBF0] relative">
          <iframe src="${esc(officePreviewUrl(opts.data))}" class="w-full h-full" style="border:0;min-height:480px"></iframe>
          <div class="absolute bottom-2 right-2 text-[11px] text-ink-faint bg-white/80 px-2 py-1 rounded">Microsoft Office 在线预览（${esc(opts.ext)}）</div>
        </div>`;
    } else {
      body.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-center p-6">
        <div class="w-12 h-12 rounded-full bg-brand-light text-brand-deep flex items-center justify-center mb-3">${icon('doc', 22)}</div>
        <div class="text-[14px] font-medium text-ink">${esc(opts.ext.toUpperCase())} 文档在线预览需要可访问的文件链接</div>
        <div class="text-[12px] text-ink-faint mt-1 max-w-[360px]">本附件以本地数据保存，请点击「下载」在本地打开查看。</div>
      </div>`;
    }
  } else {
    body.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-center p-6">
      <div class="w-12 h-12 rounded-full bg-canvas border border-line text-ink-soft flex items-center justify-center mb-3">${icon('file', 22)}</div>
      <div class="text-[14px] font-medium text-ink">该文件类型暂不支持在线预览</div>
      <div class="text-[12px] text-ink-faint mt-1">${esc(opts.unsupportedText || '请点击上方「下载」在本地打开查看。')}</div>
    </div>`;
  }

  bg.querySelector('[data-pv-close]')?.addEventListener('click', close);
  bg.querySelector('[data-pv-download]')?.addEventListener('click', () => {
    if (opts.onDownload) opts.onDownload();
  });
  bg.addEventListener('click', (ev) => { if (ev.target === bg) close(); });
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
    else if (isImg && (ev.key === '+' || ev.key === '=')) { bg.querySelector<HTMLElement>('[data-pv-zoom-in]')?.click(); }
    else if (isImg && ev.key === '-') { bg.querySelector<HTMLElement>('[data-pv-zoom-out]')?.click(); }
  };
  document.addEventListener('keydown', onKey, true);

  document.body.appendChild(bg);
}

/** 文件大小友好显示 */
export function formatSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 估算 dataURL 对应文件字节数（base64 部分长度 * 3/4） */
export function dataUrlSize(dataUrl?: string): number | undefined {
  if (!dataUrl) return undefined;
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const baseLen = b64.replace(/=+$/, '').length;
  return Math.floor((baseLen * 3) / 4);
}

/** 便捷封装：dataURL 下载（供预览弹窗的下载按钮复用） */
export function downloadDataUrl(filename: string, data?: string): void {
  if (!data) return;
  if (data.startsWith('data:')) {
    const a = document.createElement('a');
    a.href = data;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    const a = document.createElement('a');
    a.href = data;
    a.download = filename;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}