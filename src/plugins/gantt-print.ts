// 甘特打印插件：将项目甘特渲染为 A4 横向打印版
import type { Project } from '../data/types';
import { PHASE_META } from '../data/types';
import { diffDays, fmtDate, monthTicks, toISO } from '../lib';
import { esc } from '../ui';

const P_DAY_W = 14; // 打印版每日像素（A4 横向）
const P_ROW_H = 30;
const P_HDR_H = 40;

export function openGanttPrint(project: Project): void {
  const p = project;
  const start = p.stages[0]?.planStart || p.planStart;
  const end = p.stages[p.stages.length - 1]?.planEnd || p.planEnd;
  const totalDays = diffDays(toISO(new Date(end)), toISO(new Date(start))) + 1;
  const width = totalDays * P_DAY_W;
  const months = monthTicks(start, end);

  const pxLeft = (d: string) => diffDays(d, start) * P_DAY_W;
  const pxW = (f: string, t: string) => (diffDays(toISO(new Date(t)), toISO(new Date(f))) + 1) * P_DAY_W;

  const monthRow = months
    .map(m => `<div style="width:${m.days * P_DAY_W}px;display:flex;align-items:center;justify-content:center;border-right:1px solid #E1E8F0;font-size:10px">${m.label}</div>`)
    .join('');

  // 阶段行
  const phaseRows = p.stages
    .map(s => {
      const m = PHASE_META[s.key];
      const l = pxLeft(s.planStart);
      const w = pxW(s.planStart, s.planEnd);
      const color = s.status === 'done' ? '#70AD47' : s.status === 'active' ? '#5B9BD5' : '#C5CEDA';
      return `<div style="height:${P_ROW_H}px;display:flex;align-items:center;border-bottom:1px solid #EEF2F7;position:relative">
        <div style="width:200px;flex-shrink:0;font-size:11px;padding:0 8px;box-sizing:border-box">
          <div style="color:#2B3A4A"><b>${m.name}</b></div>
          <div style="color:#9AA7B8;font-size:9px">${fmtDate(s.planStart)} — ${fmtDate(s.planEnd)}</div>
        </div>
        <div style="position:relative;width:${width}px;padding:0;box-sizing:border-box">
          <div style="position:absolute;top:50%;transform:translateY(-50%);height:16px;border-radius:4px;background:${color};left:${l}px;width:${w}px"></div>
        </div>
      </div>`;
    })
    .join('');

  // 任务行
  const taskRows = p.tasks
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map(t => {
      const m = PHASE_META[t.phase];
      const l = pxLeft(t.start);
      const w = pxW(t.start, t.end);
      const fill = t.status === 'done' ? '#70AD47' : t.status === 'doing' ? PHASE_META[t.phase].color : '#C5CEDA';
      return `<div style="height:${P_ROW_H}px;display:flex;align-items:center;border-bottom:1px solid #EEF2F7;position:relative">
        <div style="width:200px;flex-shrink:0;font-size:10px;padding:0 8px;box-sizing:border-box">
          <div style="color:#2B3A4A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}${t.milestone ? ' ◈' : ''}</div>
          <div style="color:#9AA7B8;font-size:9px">${esc(t.owner || '—')} · ${m.name}</div>
        </div>
        <div style="position:relative;width:${width}px;box-sizing:border-box">
          <div style="position:absolute;top:50%;transform:translateY(-50%);height:14px;border-radius:3px;background:${fill};left:${l}px;width:${w}px"></div>
        </div>
      </div>`;
    })
    .join('');

  const todayLeft = (() => {
    const t = new Date().toISOString().slice(0, 10);
    if (!(t >= start && t <= end)) return width; // 今天在工作范围外，不画线
    return pxLeft(t);
  })();

  const mask = document.createElement('div');
  mask.id = 'ganttPrintOverlay';
  mask.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:#F3F6FA;overflow:auto;padding:24px;box-sizing:border-box;';
  mask.innerHTML = `
  <style>
    @media print {
      body * { visibility: hidden !important; }
      #ganttPrintOverlay, #ganttPrintOverlay * { visibility: visible !important; }
      #ganttPrintOverlay { position:absolute; inset:0; padding:0; background:#fff; }
      #gp-close { display:none !important; }
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
  <div style="max-width:1500px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div style="font-size:16px;font-weight:700;color:#2B3A4A;flex:1">${esc(p.name)} 甘特图</div>
      <div style="font-size:11px;color:#6B7A90">${esc(p.code)} · ${esc(p.customer)}</div>
      <button id="gp-close" style="border:1px solid #E1E8F0;background:#fff;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer">${iconPrint()}</button>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:12px;font-size:10px;color:#6B7A90;flex-wrap:wrap">
      <span>计划周期：${fmtDate(start)} — ${fmtDate(end)}（${totalDays} 天）</span>
      <span><span style="display:inline-block;width:12px;height:6px;border-radius:2px;background:#5B9BD5;vertical-align:middle"></span> 进行中</span>
      <span><span style="display:inline-block;width:12px;height:6px;border-radius:2px;background:#70AD47;vertical-align:middle"></span> 已完成</span>
      <span><span style="display:inline-block;width:12px;height:6px;border-radius:2px;background:#C5CEDA;vertical-align:middle"></span> 未开始</span>
      <span><span style="color:#C00000">│</span> 今天</span>
    </div>
    <div style="background:#fff;border:1px solid #E1E8F0;border-radius:8px;overflow:auto">
      <div style="min-width:${200 + width}px;display:flex;flex-direction:column">
        <div style="height:${P_HDR_H}px;display:flex;align-items:stretch;border-bottom:1px solid #E1E8F0">
          <div style="width:200px;flex-shrink:0;border-right:1px solid #E1E8F0;display:flex;align-items:center;padding:0 8px;font-size:11px;font-weight:600;color:#6B7A90">阶段 / 任务</div>
          <div style="display:flex;width:${width}px">${monthRow}</div>
        </div>
        ${phaseRows}
        ${taskRows || '<div style="padding:16px;color:#9AA7B8;font-size:11px">暂无任务</div>'}
      </div>
    </div>
    <div style="margin-top:14px;font-size:10px;color:#9AA7B8;text-align:center">由 IT 项目管理系统 · 甘特打印插件生成 | ${new Date().toLocaleString()}</div>
  </div>`;

  // 今天线（叠加）
  requestAnimationFrame(() => {
    const bars = mask.querySelectorAll('div[style*="position:relative"]');
    void bars;
  });

  document.body.appendChild(mask);
  const close = mask.querySelector('#gp-close');
  if (close) close.addEventListener('click', () => mask.remove());

  window.print();
  setTimeout(() => {
    if (mask.isConnected) mask.remove();
  }, 1500);
}

function iconPrint(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>` + ' 打印';
}