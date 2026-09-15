import { toast, icon } from '../ui';
import { getSettings, saveSettings } from '../store';
import { applySysSettings, downloadText } from '../lib';
import { notifyPermission, setNotifyEnabled } from '../notify';

export function renderSettings(root: HTMLElement): void {
  const s = getSettings();
  applySysSettings(s);

  const row = (label: string, control: string, hint?: string): string =>
    `<div class="flex items-center justify-between gap-4 py-2.5">
      <div>
        <div class="text-[13px] text-ink font-medium">${label}</div>
        ${hint ? `<div class="text-[12px] text-ink-faint mt-0.5">${hint}</div>` : ''}
      </div>
      <div class="shrink-0">${control}</div>
    </div>`;

  const isOn = (v: boolean) => (v ? 'bg-[#5B9BD5]' : 'bg-[#C5CEDA]');
  const sw = (id: string, on: boolean): string =>
    `<button id="${id}" class="sw ${on ? 'sw-on bg-[#5B9BD5]' : 'bg-[#C5CEDA]'}" style="width:38px;height:21px;border-radius:12px;display:inline-flex;align-items:center;padding:2px;transition:background .15s" aria-pressed="${on}">
      <span style="width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transform:translateX(${on ? '17px' : '0'});transition:transform .15s"></span>
    </button>`;

  root.innerHTML = `
    <div class="mx-auto max-w-3xl">
      <div class="flex items-center gap-2 pb-3">
        <span class="text-[#5B9BD5]">${icon('settings', 18)}</span>
        <div>
          <div class="text-[15px] font-semibold text-ink">系统设置</div>
          <div class="text-[12px] text-ink-faint">偏好设置实时生效并保存在本机浏览器</div>
        </div>
      </div>

      <div class="grid gap-4">
        <div class="border border-line rounded-lg bg-white p-5">
          <div class="card-title text-[14px] font-semibold text-ink mb-1">外观</div>
          <div class="text-[12px] text-ink-faint mb-3">同步更新全局主题、顶栏与按钮品牌色</div>
          ${row('品牌主色', `<input id="setColor" type="color" value="${s.brand}" class="h-8 w-16 cursor-pointer rounded border border-line bg-white p-0.5">`)}
          ${row('全局字号', `<div class="flex items-center gap-2"><input id="setFont" type="range" min="11" max="16" step="1" value="${s.fs}" class="w-28"><span id="fontVal" class="text-[12px] text-ink-faint w-8">${s.fs}px</span></div>`, '页面基准字号')}
        </div>

        <div class="border border-line rounded-lg bg-white p-5">
          <div class="card-title text-[14px] font-semibold text-ink mb-1">提醒</div>
          <div class="text-[12px] text-ink-faint mb-3">控制首页「到期提醒」的预警等级</div>
          ${row('提前 3 天黄色预警', sw('setRemind3', s.remind3), '3 天内到期的任务/阶段')}
          ${row('提前 1 天橙色预警', sw('setRemind1', s.remind1), '24 小时内到期')}
          ${row('预警窗口天数', `<div class="flex items-center gap-2"><input id="setDays" type="number" min="1" max="60" value="${s.remindDays ?? 7}" class="h-8 w-20 rounded border border-line bg-white px-2 text-[13px] text-ink">天</div>`, '拉长预警观察窗口，默认 7 天')}
        </div>

        <div class="border border-line rounded-lg bg-white p-5">
          <div class="card-title text-[14px] font-semibold text-ink mb-1">浏览器通知</div>
          <div class="text-[12px] text-ink-faint mb-3">页面运行期间定期检查到期任务并推送系统通知</div>
          ${row('开启浏览器通知', sw('setNotify', !!s.notifyEnabled), '首次开启会请求浏览器通知权限')}
          ${row('每日提醒时刻', `<div class="flex items-center gap-2"><select id="setNotifyHour" class="input h-8"><option value="8" ${s.notifyHour === 8 ? 'selected' : ''}>08:00</option><option value="9" ${s.notifyHour === 9 ? 'selected' : ''}>09:00</option><option value="10" ${s.notifyHour === 10 ? 'selected' : ''}>10:00</option></select></div>`, '到点推送当天到期 / 3 天内到期 / 已逾期任务')}
          <div id="notifyState" class="text-[12px] mt-1"></div>
        </div>

        <div class="border border-line rounded-lg bg-white p-5">
          <div class="card-title text-[14px] font-semibold text-ink mb-1">数据管理</div>
          <div class="text-[12px] text-ink-faint mb-3">备份/恢复浏览器本地数据</div>
          <div class="flex flex-wrap gap-2 pt-1">
            <button id="backupBtn" class="btn">${icon('download', 15)} 备份数据</button>
            <button id="restoreBtn" class="btn btn-ghost">${icon('upload', 15)} 恢复数据</button>
          </div>
          <input id="restoreFile" type="file" accept="application/json,.json" class="hidden">
          <div class="text-[12px] text-ink-faint mt-3">备份将导出全部本地数据为 JSON 文件；恢复会读取该文件并覆盖当前数据。</div>
        </div>
      </div>
    </div>`;

  // 品牌主色
  const colorEl = root.querySelector<HTMLInputElement>('#setColor');
  colorEl?.addEventListener('input', () => {
    const next = { brand: colorEl.value };
    saveSettings(next);
    applySysSettings({ ...getSettings() });
  });
  colorEl?.addEventListener('change', () => {
    toast('品牌主色已更新');
  });

  // 全局字号
  const fontEl = root.querySelector<HTMLInputElement>('#setFont');
  const fontVal = root.querySelector('#fontVal');
  fontEl?.addEventListener('input', () => {
    const v = Number(fontEl.value);
    saveSettings({ fs: v });
    applySysSettings({ ...getSettings() });
    if (fontVal) fontVal.textContent = `${v}px`;
  });
  fontEl?.addEventListener('change', () => toast('全局字号已更新'));

  // 提醒开关
  const sws: Array<[string, keyof ReturnType<typeof getSettings>, () => void]> = [
    ['#setRemind3', 'remind3', () => toast('黄色预警已' + (getSettings().remind3 ? '开启' : '关闭'))],
    ['#setRemind1', 'remind1', () => toast('橙色预警已' + (getSettings().remind1 ? '开启' : '关闭'))],
  ];

  // 预警窗口天数
  const dayEl = root.querySelector<HTMLInputElement>('#setDays');
  dayEl?.addEventListener('change', () => {
    const v = Math.max(1, Math.min(60, Number(dayEl.value) || 7));
    dayEl.value = String(v);
    saveSettings({ remindDays: v });
    toast(`预警窗口已设为 ${v} 天`);
  });
  for (const [sel, key, cb] of sws) {
    const el = root.querySelector<HTMLButtonElement>(sel);
    el?.addEventListener('click', () => {
      const cur = getSettings();
      const next = !(cur[key] as boolean);
      saveSettings({ [key]: next } as Partial<ReturnType<typeof getSettings>>);
      // 更新视觉
      const { brand } = getSettings();
      el.style.background = next ? brand : '#C5CEDA';
      const dot = el.querySelector('span');
      if (dot) dot.style.transform = `translateX(${next ? '17px' : '0'})`;
      el.setAttribute('aria-pressed', String(next));
      el.classList.toggle('bg-[#5B9BD5]', next);
      cb();
    });
  }

  // 浏览器通知开关
  const notifSw = root.querySelector<HTMLButtonElement>('#setNotify');
  const notifState = root.querySelector<HTMLDivElement>('#notifyState');
  const renderNotifyState = (): void => {
    if (!notifState) return;
    const cn = notifyPermission();
    if (cn === 'unsupported') { notifState.textContent = '当前浏览器不支持系统通知'; notifState.style.color = '#C00000'; return; }
    if (cn === 'granted') { notifState.textContent = '通知权限：已授权'; notifState.style.color = '#70AD47'; return; }
    if (cn === 'denied') { notifState.textContent = '通知权限：已被浏览器拒绝，请在站点设置中允许'; notifState.style.color = '#C00000'; return; }
    notifState.textContent = '通知权限：未授权（开启后将请求授权）'; notifState.style.color = '#6B7A90';
  };
  renderNotifyState();
  notifSw?.addEventListener('click', async () => {
    const willOn = getSettings().notifyEnabled !== true;
    const res = await setNotifyEnabled(willOn);
    if (res.opened) {
      toast('浏览器通知已开启，将按设定时刻推送到期提醒', 'success');
    } else if (res.permission === 'unsupported') {
      toast('当前浏览器不支持系统通知');
    } else if (res.permission === 'denied') {
      toast('通知权限被拒绝，请在浏览器站点设置中允许后重试', 'warn');
    } else {
      // 未授权：回到关闭状态
      saveSettings({ notifyEnabled: false });
      toast('未获得通知权限，通知未开启', 'warn');
    }
    // 更新开关视觉
    const on = getSettings().notifyEnabled === true;
    notifSw.style.background = on ? (getSettings().brand) : '#C5CEDA';
    const dot = notifSw.querySelector('span');
    if (dot) dot.style.transform = `translateX(${on ? '17px' : '0'})`;
    notifSw.setAttribute('aria-pressed', String(on));
    notifSw.classList.toggle('bg-[#5B9BD5]', on);
    renderNotifyState();
  });
  // 提醒时刻
  const hourEl = root.querySelector<HTMLSelectElement>('#setNotifyHour');
  hourEl?.addEventListener('change', () => {
    saveSettings({ notifyHour: Number(hourEl.value) });
    toast('每日提醒时刻已更新');
  });

  // 备份
  root.querySelector('#backupBtn')?.addEventListener('click', () => {
    try {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) data[k] = localStorage.getItem(k) ?? '';
      }
      downloadText(`pm-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('已导出备份文件');
    } catch (e) {
      console.error('备份失败', e);
      toast('数据保存失败，请检查浏览器存储');
    }
  });

  // 恢复
  const fileEl = root.querySelector<HTMLInputElement>('#restoreFile');
  root.querySelector('#restoreBtn')?.addEventListener('click', () => fileEl?.click());
  fileEl?.addEventListener('change', () => {
    const f = fileEl.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Record<string, string>;
        for (const k of Object.keys(data)) {
          try { localStorage.setItem(k, data[k]); } catch { /* ignore */ }
        }
        toast('数据已恢复，正在刷新…');
        window.location.reload();
      } catch {
        toast('备份文件格式不正确，恢复失败');
      }
    };
    reader.readAsText(f);
    fileEl.value = '';
  });
}