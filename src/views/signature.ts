// 电子签名：手写画布（canvas）+ 预置草书签名 + 签名管理
import { getSignatures, addSignature, setDefaultSignature, removeSignature } from '../store';
import type { Signature } from '../data/types';
import { presetSignature } from '../lib';
import { esc, icon, toast } from '../ui';

/** 预置「张启凡」草书签名（透明底 SVG）——实现见 lib.ts */
export { presetSignature };

/** 默认（当前使用）签名 */
export function currentSignature(): Signature | undefined {
  const sigs = getSignatures();
  return sigs.find(s => s.isDefault) ?? sigs[0];
}

/** 把签名转成 `<img>`（等比缩放；可选高度 px） */
export function signatureImg(sig: Signature | undefined, height = 42): string {
  if (!sig) return '';
  return `<img src="${sig.dataURL}" alt="电子签名" style="height:${height}px;max-width:100%;display:inline-block;vertical-align:middle" />`;
}

/* ---------- 手写签名画布弹窗 ----------
   onConfirm(dataURL) 确认后回调 */
export function openSignaturePad(options: { title?: string; onConfirm?: (dataURL: string) => void } = {}): void {
  const W = 400;
  const H = 200;
  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
  <div class="bg-white rounded-lg w-[460px] max-w-[94vw] shadow-xl border border-line overflow-hidden">
    <div class="flex items-center justify-between px-5 py-3 border-b border-hair">
      <div class="text-[15px] font-semibold text-ink">${icon('edit', 15)} ${options.title ?? '手写签名'}</div>
      <button class="sp-close btn-ghost">${icon('x', 16)}</button>
    </div>
    <div class="px-5 py-4">
      <div class="text-[12px] text-ink-soft mb-2">在下方区域内手写签名（鼠标 / 触屏均可）</div>
      <div class="relative border border-line rounded-md overflow-hidden" style="background:#fff">
        <canvas id="sigCanvas" width="${W}" height="${H}" style="width:100%;height:${H*0.9}px;cursor:crosshair;display:block"></canvas>
      </div>
      <div class="flex items-center justify-between mt-3">
        <button id="sigClear" class="btn-ghost text-[12px]">${icon('trash', 13)} 清除</button>
        <div class="flex gap-2">
          <button class="sp-close btn">取消</button>
          <button id="sigConfirm" class="btn-primary">${icon('check', 14)} 确认保存</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.querySelectorAll('.sp-close').forEach(b => b.addEventListener('click', close));
  bg.addEventListener('click', e => { if (e.target === bg) close(); });

  const canvas = bg.querySelector('#sigCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1F2A38';

  let drawing = false;
  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  };
  canvas.addEventListener('pointerdown', e => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointerleave', stop);

  bg.querySelector('#sigClear')?.addEventListener('click', () => {
    ctx.clearRect(0, 0, W, H);
  });

  bg.querySelector('#sigConfirm')?.addEventListener('click', () => {
    // 检查是否有笔迹（非透明像素）
    const data = ctx.getImageData(0, 0, W, H).data;
    let hasInk = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) { hasInk = true; break; }
    }
    if (!hasInk) { toast('请先在区域内手写签名', 'warn'); return; }
    const dataURL = canvas.toDataURL('image/png'); // 透明底
    options.onConfirm?.(dataURL);
    close();
    toast('签名已保存', 'success');
  });
}

/* ---------- 签名管理面板（嵌到个人中心） ---------- */
export function renderSignatureManager(container: HTMLElement): void {
  const draw = () => {
    const sigs = getSignatures();
    const current = currentSignature();
    container.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="min-w-0">
        <div class="text-[13px] font-semibold text-ink flex items-center gap-1.5">${icon('edit', 14)} 我的电子签名</div>
        <div class="text-[11px] text-ink-faint mt-1">插入 <span class="px-1 py-0.5 rounded tpl-ph text-[10px]">{'{签名}'}</span> 字段的模板，生成文档时会自动使用此签名。</div>
      </div>
      <button id="sigNew" class="btn-primary text-[12px] px-3 py-1.5 shrink-0">${icon('edit', 13)} 重新手写</button>
    </div>
    <div class="grid grid-cols-1 gap-2">
      ${sigs.map(s => `
      <div class="flex items-center gap-3 border border-hair rounded-md px-3 py-2 ${s.id === current?.id ? 'bg-brand-light/40 border-brand' : ''}" data-sid="${s.id}">
        <div class="w-32 h-14 bg-white border border-hair rounded flex items-center justify-center overflow-hidden">
          <img src="${s.dataURL}" alt="${esc(s.name)}" style="max-height:44px;max-width:120px" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[12px] text-ink">${esc(s.name)}${s.id === current?.id ? ' <span class="text-brand-deep text-[10px]">· 当前使用</span>' : ''}</div>
          <div class="text-[10px] text-ink-faint">创建于 ${s.createdAt}</div>
        </div>
        <div class="flex items-center gap-1.5 text-[11px]">
          ${s.id !== current?.id ? `<button class="sig-use text-brand-deep">使用</button>` : ''}
          <button class="sig-del text-ink-faint hover:text-[#C00000]">${icon('trash', 12)}</button>
        </div>
      </div>`).join('')}
    </div>
    <div class="text-[11px] text-ink-faint mt-2">签名以 PNG/SVG 透明底保存在本机；可分多次录制多套签名，点击「使用」切换生成文档时采用的签名。</div>`;

    container.querySelector('#sigNew')?.addEventListener('click', () => {
      openSignaturePad({
        title: '重新手写签名（张启凡）',
        onConfirm: dataURL => {
          addSignature({ id: `sig_${Date.now()}`, name: '张启凡', dataURL, createdAt: new Date().toISOString().slice(0, 10), isDefault: sigs.length === 0 });
          draw();
        },
      });
    });
    container.querySelectorAll<HTMLElement>('.sig-use').forEach(b =>
      b.addEventListener('click', () => {
        const sid = (b.closest('[data-sid]') as HTMLElement | null)?.getAttribute('data-sid') || '';
        setDefaultSignature(sid);
        draw();
        toast('已切换为当前签名', 'success');
      }));
    container.querySelectorAll<HTMLElement>('.sig-del').forEach(b =>
      b.addEventListener('click', () => {
        const sid = (b.closest('[data-sid]') as HTMLElement | null)?.getAttribute('data-sid') || '';
        const sig = sigs.find(s => s.id === sid);
        if (sig && window.confirm(`删除签名「${sig.name}」？`)) { removeSignature(sig.id); draw(); }
      }));
  };
  draw();
}