// 个人中心：基本信息 + 修改密码 + 系统设置 + 电子签名
import { getProfile, changePassword, saveProfile, currentUser, type Profile } from '../auth';
import { esc, icon, toast } from '../ui';
import { renderSignatureManager } from './signature';

export function renderProfile(root: HTMLElement): void {
  const p = getProfile();

  root.innerHTML = `
  <div class="mx-auto max-w-4xl">

    <!-- 品牌横幅 + 身份卡 -->
    <div class="rounded-lg overflow-hidden border border-line shadow-sm">
      <div class="px-5 pt-4 pb-10" style="background:linear-gradient(120deg,#5B9BD5 0%,#4A8BC2 55%,#3D74A8 100%);">
        <div class="text-[12px] text-white/85 flex items-center gap-1.5">
          ${icon('user', 13)} 个人中心 <span class="opacity-60">/</span> <span>账号与偏好设置</span>
        </div>
      </div>
      <div class="bg-white px-5 pb-4">
        <div class="flex items-end justify-between -mt-8">
          <div class="flex items-end gap-3.5">
            <div id="avatarHalo" class="w-20 h-20 rounded-full border-4 border-white shadow-md overflow-hidden bg-brand-light flex items-center justify-center">
              <span id="avatarLetter" class="text-[26px] font-bold text-brand-deep">${(p.name || currentUser() || 'U').slice(0, 1).toUpperCase()}</span>
            </div>
            <div class="pb-1">
              <div class="flex items-center gap-2">
                <span class="text-[17px] font-semibold text-ink leading-tight">${esc(p.name || currentUser())}</span>
                <span class="inline-flex items-center gap-1 text-[10px] text-[#507A2E] bg-[#EAF4E1] border border-[#C6E0AF] rounded-full px-1.5 py-0.5">${icon('check', 10)} 已登录</span>
              </div>
              <div class="mt-1 flex items-center gap-3 text-[12px] text-ink-soft">
                <span class="flex items-center gap-1">${icon('user', 12)} 账号 ${esc(currentUser())}</span>
                <span class="w-px h-3 bg-line inline-block"></span>
                <span class="flex items-center gap-1">${icon('phone', 12)} ${esc(p.phone || '未填写手机')}</span>
              </div>
            </div>
          </div>
          <div class="pb-1 text-right">
            <label class="btn-ghost text-[12px] cursor-pointer">
              ${icon('upload', 13)} 更换头像
              <input type="file" id="avatarInput" accept="image/*" class="hidden" />
            </label>
            <div class="text-[10.5px] text-ink-faint mt-1">图片仅保存在本机浏览器</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 两列：基本信息 / 修改密码 -->
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">

      <!-- 基本信息 -->
      <div class="card lg:col-span-3 p-5">
        <div class="flex items-center gap-2">
          <span class="text-brand-deep">${icon('user', 16)}</span>
          <h3 class="card-title">基本信息</h3>
        </div>
        <p class="text-[11.5px] text-ink-faint mt-1.5">资料会同步显示在顶部导航栏与文档署名中。</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5 mt-4">
          <label class="block">
            <span class="lbl">姓名</span>
            <input id="pfName" class="input mt-1" value="${esc(p.name)}" placeholder="你的姓名" />
          </label>
          <label class="block">
            <span class="lbl">手机号</span>
            <input id="pfPhone" class="input mt-1" value="${esc(p.phone)}" placeholder="选填" />
          </label>
          <label class="block sm:col-span-2">
            <span class="lbl">邮箱</span>
            <input id="pfEmail" class="input mt-1" value="${esc(p.email)}" placeholder="选填" />
          </label>
        </div>
        <div class="border-t border-hair mt-5 pt-4 flex justify-end">
          <button id="pfSave" class="btn-primary">${icon('check', 14)} 保存资料</button>
        </div>
      </div>

      <!-- 修改密码 -->
      <div class="card lg:col-span-2 p-5">
        <div class="flex items-center gap-2">
          <span class="text-brand-deep">${icon('lock', 16)}</span>
          <h3 class="card-title">修改密码</h3>
        </div>
        <p class="text-[11.5px] text-ink-faint mt-1.5">修改后下次登录生效。</p>
        <div class="space-y-3.5 mt-4">
          <label class="block">
            <span class="lbl">原密码</span>
            <input id="pfOld" type="password" class="input mt-1" placeholder="请输入当前密码" />
          </label>
          <label class="block">
            <span class="lbl">新密码</span>
            <input id="pfNew" type="password" class="input mt-1" placeholder="至少 6 位" />
          </label>
          <label class="block">
            <span class="lbl">确认新密码</span>
            <input id="pfNew2" type="password" class="input mt-1" placeholder="再次输入新密码" />
          </label>
        </div>
        <div class="border-t border-hair mt-5 pt-4 flex justify-end">
          <button id="pfPwd" class="btn">${icon('lock', 14)} 提交修改</button>
        </div>
      </div>
    </div>

    <!-- 电子签名 -->
    <div class="card p-5 mt-4">
      <div class="flex items-center gap-2">
        <span class="text-brand-deep">${icon('edit', 16)}</span>
        <h3 class="card-title">电子签名</h3>
      </div>
      <p class="text-[11.5px] text-ink-faint mt-1.5">用于文档签署栏，生成文档时通过 <span class="px-1 rounded tpl-ph">{'{签名}'}</span> 占位符自动插入。</p>
      <div class="border-t border-hair mt-4 pt-4">
        <div id="sigPanel"></div>
      </div>
    </div>

    <!-- 系统设置 -->
    <div class="card p-5 mt-4">
      <div class="flex items-center gap-2">
        <span class="text-brand-deep">${icon('settings', 16)}</span>
        <h3 class="card-title">系统设置</h3>
      </div>
      <p class="text-[11.5px] text-ink-faint mt-1.5">界面主题与语言偏好（当前为单机版，仅浅色 / 中文）。</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5 mt-4">
        <label class="block">
          <span class="lbl">主题</span>
          <select id="pfTheme" class="input mt-1" disabled>
            <option value="light" selected>浅色主题（默认）</option>
          </select>
        </label>
        <label class="block">
          <span class="lbl">语言</span>
          <select id="pfLang" class="input mt-1" disabled>
            <option value="zh-CN" selected>简体中文</option>
          </select>
        </label>
      </div>
    </div>

  </div>`;

  // 头像上传（本地预览，不落库）
  const avatarInput = document.getElementById('avatarInput') as HTMLInputElement;
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    // 读取图片，若超过 500KB 则用 canvas 等比压缩
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 500 * 1024;
      let dataUrl: string;
      if (file.size > MAX) {
        const scale = Math.min(1, Math.sqrt(MAX / file.size));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      } else {
        // 小图片直接转 dataURL 以持久化
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const du = String(reader.result || '');
          const halo = document.getElementById('avatarHalo') as HTMLElement;
          halo.innerHTML = `<img src="${du}" alt="头像" class="w-full h-full object-cover" />`;
          saveProfile({ ...getProfile(), avatar: du });
          toast('头像已更新', 'success');
        };
        return;
      }
      const halo = document.getElementById('avatarHalo') as HTMLElement;
      halo.innerHTML = `<img src="${dataUrl}" alt="头像" class="w-full h-full object-cover" />`;
      saveProfile({ ...getProfile(), avatar: dataUrl });
      toast('图片较大，已自动压缩（<500KB）后保存', 'success');
    };
    img.src = url;
  });

  // 保存资料
  document.getElementById('pfSave')?.addEventListener('click', () => {
    const profile: Profile = {
      name: (document.getElementById('pfName') as HTMLInputElement).value.trim(),
      phone: (document.getElementById('pfPhone') as HTMLInputElement).value.trim(),
      email: (document.getElementById('pfEmail') as HTMLInputElement).value.trim(),
      avatar: p.avatar,
    };
    if (!profile.name) { toast('请填写姓名', 'warn'); return; }
    saveProfile(profile);
    // 同步身份卡
    const letter = document.getElementById('avatarLetter');
    if (letter && !p.avatar) letter.textContent = profile.name.slice(0, 1).toUpperCase();
    toast('资料已保存', 'success');
  });

  // 修改密码
  document.getElementById('pfPwd')?.addEventListener('click', () => {
    const oldPw = (document.getElementById('pfOld') as HTMLInputElement).value;
    const newPw = (document.getElementById('pfNew') as HTMLInputElement).value;
    const newPw2 = (document.getElementById('pfNew2') as HTMLInputElement).value;
    if (!oldPw || !newPw) { toast('请填写原密码与新密码', 'warn'); return; }
    if (newPw !== newPw2) { toast('两次输入的新密码不一致', 'warn'); return; }
    const result = changePassword(oldPw, newPw);
    if (!result.ok) { toast(result.msg, 'warn'); return; }
    toast(result.msg, 'success');
    (document.getElementById('pfOld') as HTMLInputElement).value = '';
    (document.getElementById('pfNew') as HTMLInputElement).value = '';
    (document.getElementById('pfNew2') as HTMLInputElement).value = '';
  });

  // 电子签名管理
  const sigPanel = document.getElementById('sigPanel') as HTMLElement;
  renderSignatureManager(sigPanel);
}
