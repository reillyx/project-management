// 插件中心：真实启停（VS Code 风格）+ 扩展能力 + 每插件配置面板
import { esc, icon, toast } from '../ui';
import { PLUGIN_DEFS, isPluginEnabled, setPluginEnabled } from '../plugins/registry';

type CfgField = {
  key: string;
  label: string;
  type: 'number' | 'select';
  default: string;
  options?: Array<{ value: string; label: string }>;
  tip?: string;
};

const CFG_KEY = 'pm_plugin_cfg_v1';

const PLUGIN_CFG: Record<string, { title: string; items: CfgField[] }> = {
  hours: {
    title: '工时统计配置',
    items: [
      { key: 'dailyCap', label: '每日工时上限（小时）', type: 'number', default: '8', tip: '超出视为异常工时，报表中以预警色标出' },
      {
        key: 'exportKind', label: '导出格式', type: 'select', default: 'xlsx',
        options: [
          { value: 'xlsx', label: 'Excel (.xlsx)' },
          { value: 'csv', label: 'CSV (.csv)' },
        ],
      },
    ],
  },
  'gantt-print': {
    title: '甘特打印配置',
    items: [
      {
        key: 'orient', label: '纸张方向', type: 'select', default: 'landscape',
        options: [
          { value: 'landscape', label: '横向（推荐）' },
          { value: 'portrait', label: '纵向' },
        ],
      },
      {
        key: 'scale', label: '缩放比例', type: 'select', default: '100',
        options: [
          { value: '100', label: '100%' },
          { value: '75', label: '75%' },
          { value: '50', label: '50%' },
        ],
      },
    ],
  },
  dashboard: {
    title: '数据看板配置',
    items: [
      { key: 'showAmounts', label: '展示金额汇总', type: 'select', default: '1', options: [{ value: '1', label: '显示' }, { value: '0', label: '隐藏' }] },
      { key: 'showCharts', label: '展示可视化图表', type: 'select', default: '1', options: [{ value: '1', label: '显示' }, { value: '0', label: '隐藏' }] },
    ],
  },
  notify: {
    title: '自动通知配置',
    items: [
      {
        key: 'defaultType', label: '默认通知类型', type: 'select', default: 'upgrade',
        options: [
          { value: 'upgrade', label: '上线通知' },
          { value: 'change', label: '变更通知' },
          { value: 'meeting', label: '会议纪要' },
          { value: 'training', label: '培训通知' },
        ],
      },
    ],
  },
};

function loadCfg(): Record<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Record<string, string>>) : {};
  } catch {
    return {};
  }
}

function saveCfg(map: Record<string, Record<string, string>>): void {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(map));
  } catch {
    toast('数据保存失败，请检查浏览器存储', 'warn');
  }
}

/** 读取某插件的配置（合并默认值） */
export function getPluginCfg(id: string): Record<string, string> {
  const schema = PLUGIN_CFG[id];
  if (!schema) return {};
  const map = loadCfg()[id] ?? {};
  const out: Record<string, string> = {};
  for (const f of schema.items) out[f.key] = map[f.key] !== undefined ? map[f.key] : f.default;
  return out;
}

/** 便捷取值 */
export function pluginCfgNum(id: string, key: string, fallback: number): number {
  const raw = getPluginCfg(id)[key];
  const n = Number(raw);
  return Number.isFinite(n) && raw !== '' ? n : fallback;
}

function openConfigModal(id: string): void {
  const schema = PLUGIN_CFG[id];
  const def = PLUGIN_DEFS.find(p => p.id === id);
  if (!schema) {
    toast('该插件暂无配置项', 'info');
    return;
  }
  const cfg = loadCfg()[id] ?? {};

  const row = (f: CfgField): string => {
    const val = cfg[f.key] ?? f.default;
    const inp = f.type === 'select'
      ? `<select data-cfg="${f.key}" class="input w-full">${(f.options ?? []).map(o => `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`
      : `<input data-cfg="${f.key}" type="number" min="0" class="input w-full" value="${esc(val)}">`;
    return `<div><label class="field-label">${esc(f.label)}</label>${inp}${f.tip ? `<div class="text-[11px] text-ink-faint mt-1">${esc(f.tip)}</div>` : ''}</div>`;
  };

  const bg = document.createElement('div');
  bg.className = 'modal-mask';
  bg.innerHTML = `
    <div class="bg-white rounded-lg w-[430px] max-w-full shadow-xl border border-line">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-hair">
        <div class="text-[15px] font-semibold text-ink">${icon('settings', 16)} ${esc(def?.name ?? schema.title)}</div>
        <button class="modal-close btn-ghost">${icon('x', 16)}</button>
      </div>
      <div class="px-5 py-4 space-y-3.5">
        <div class="text-[12px] text-ink-faint leading-relaxed">${esc(schema.title)} · 保存于本机，修改即时生效</div>
        ${schema.items.map(row).join('')}
      </div>
      <div class="flex justify-end gap-2 px-5 py-3.5 border-t border-hair bg-canvas/40 rounded-b-lg">
        <button class="modal-close btn">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(bg);

  const close = () => bg.remove();
  bg.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', close));
  bg.addEventListener('click', e => { if (e.target === bg) close(); });

  bg.querySelectorAll<HTMLElement>('[data-cfg]').forEach(el => {
    const apply = () => {
      const map = loadCfg();
      if (!map[id]) map[id] = {};
      map[id][el.getAttribute('data-cfg')!] = (el as HTMLInputElement | HTMLSelectElement).value;
      saveCfg(map);
    };
    el.addEventListener('change', () => {
      apply();
      toast('配置已保存', 'success');
      window.dispatchEvent(new CustomEvent('plugin:changed', { detail: { id } }));
    });
  });
}

export function renderPlugins(root: HTMLElement): void {
  const cards = PLUGIN_DEFS.map(p => {
    const on = isPluginEnabled(p.id);
    const hasCfg = !!PLUGIN_CFG[p.id];
    return `<div class="card p-4 flex flex-col gap-3">
      <div class="flex items-start gap-2.5">
        <div class="w-9 h-9 rounded-lg flex items-center justify-center ${on ? 'bg-brand-light text-brand-deep' : 'bg-canvas/60 text-ink-faint'}">${icon(p.icon, 18)}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[13px] font-semibold text-ink">${esc(p.name)}</span>
            <span class="px-1 py-0.5 rounded bg-canvas/70 text-[10px] text-ink-faint font-mono">v${esc(p.version)}</span>
          </div>
          <p class="text-[12px] text-ink-soft leading-relaxed mt-1">${esc(p.desc)}</p>
        </div>
        <label class="shrink-0 relative inline-flex items-center cursor-pointer">
          <input type="checkbox" class="sr-only peer" data-plg-toggle="${p.id}" ${on ? 'checked' : ''}>
          <div class="w-9 h-5 bg-[#CBD6E0] rounded-full peer-checked:bg-brand peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
        </label>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[11px] ${on ? 'text-[#4A8A3A] bg-[#E8F3E4]' : 'text-ink-faint bg-canvas/60'} px-1.5 py-0.5 rounded font-medium">${on ? '已启用' : '已禁用'}</span>
        <div class="flex-1"></div>
        ${hasCfg ? `<button class="btn-ghost text-[12px] !px-2" data-plg-config="${p.id}">${icon('settings', 13)} 配置</button>` : ''}
      </div>
    </div>`;
  }).join('');

  root.innerHTML = `
  <div class="max-w-[1000px] mx-auto space-y-4 view-enter">
    <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('plug', 17)} 插件中心</div>
    <div class="card p-4 text-[12px] text-ink-soft leading-relaxed bg-brand-light/40 border-brand/20">
      <div class="font-semibold text-ink mb-1">启用 / 禁用（VS Code 扩展风格）+ 独立配置</div>
      每个插件可独立开启或关闭：<b>启用</b> = 对应功能在工作台、项目详情、甘特中可见可用；<b>禁用</b> = 对应菜单/按钮/页面完全隐藏，像没装一样。点「配置」可设置工时上限、导出格式、打印方向、看板显示项与默认通知类型。状态保存在本机 localStorage，关闭浏览器后仍然保留。
    </div>
    <div class="card p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">${cards}</div>
  </div>`;

  root.querySelectorAll<HTMLInputElement>('[data-plg-toggle]').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.getAttribute('data-plg-toggle')!;
      setPluginEnabled(id, chk.checked);
      const def = PLUGIN_DEFS.find(d => d.id === id);
      toast(`插件「${def?.name}」已${chk.checked ? '启用' : '禁用'}`, chk.checked ? 'success' : 'info');
    });
  });

  root.querySelectorAll<HTMLElement>('[data-plg-config]').forEach(btn => {
    btn.addEventListener('click', () => openConfigModal(btn.getAttribute('data-plg-config')!));
  });
}