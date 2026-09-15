// 登录页：全屏居中卡片（本地鉴权）+ 密码可见切换 + 错误提示
import { login } from '../auth';
import { icon, toast } from '../ui';

export function renderLogin(root: HTMLElement): void {
  root.innerHTML = `
  <div class="min-h-screen flex items-center justify-center px-4" style="background:linear-gradient(160deg,#F3F6FA 0%,#EAF3FB 55%,#E3EEF8 100%)">
    <div class="w-full max-w-sm">
      <div class="flex flex-col items-center mb-6">
        <div class="w-14 h-14 rounded-xl flex items-center justify-center shadow-md mb-3" style="background:linear-gradient(135deg,#5B9BD5,#3D74A8)">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4.5" width="14" height="4" rx="1.2" fill="#FFFFFF" opacity="0.95"/>
            <rect x="3" y="10.5" width="10" height="4" rx="1.2" fill="#FFFFFF" opacity="0.72"/>
            <rect x="3" y="16.5" width="17" height="4" rx="1.2" fill="#FFFFFF" opacity="0.5"/>
            <circle cx="19" cy="12.5" r="2.3" fill="#70AD47" stroke="#FFFFFF" stroke-width="1.2"/>
          </svg>
        </div>
        <div class="text-[18px] font-semibold text-ink">项目管理系统</div>
        <div class="text-[11px] tracking-[0.18em] mt-0.5" style="color:#5B9BD5">PROJECT HUB · IT</div>
      </div>

      <div class="bg-white rounded-xl border border-line shadow-lg p-6">
        <div class="text-[15px] font-semibold text-ink mb-1">欢迎登录</div>
        <div class="text-[12px] text-ink-faint mb-5">IT 集成项目全生命周期管理</div>

        <form id="loginForm" class="space-y-4">
          <label class="block">
            <span class="block text-[12px] text-ink-soft mb-1.5">用户名</span>
            <div class="relative">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">${icon('user', 15)}</span>
              <input id="loginUser" class="input pl-8 w-full" value="admin" placeholder="请输入用户名" autocomplete="username" />
            </div>
          </label>
          <label class="block">
            <span class="block text-[12px] text-ink-soft mb-1.5">密码</span>
            <div class="relative">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">${icon('lock', 15)}</span>
              <input id="loginPwd" type="password" class="input pl-8 pr-9 w-full" value="" placeholder="请输入密码" autocomplete="current-password" />
              <button type="button" id="togglePwd" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-brand-deep transition-colors" aria-label="显示/隐藏密码" title="显示/隐藏密码">
                <span id="eyeIcon">${icon('eye', 16)}</span>
              </button>
            </div>
          </label>
          <div id="loginErr" class="text-[12px] text-[#C00000] min-h-[16px]"></div>
          <button type="submit" class="btn-primary w-full justify-center py-2.5" style="background:var(--brand, #5B9BD5)">${icon('lock', 14)} 登 录</button>
        </form>

        <div class="mt-4 pt-4 border-t border-hair text-[11px] text-ink-faint leading-relaxed">
          请输入账号密码登录<br/>
          本地单机版，登录状态保存在本机浏览器。
        </div>
      </div>
    </div>
  </div>`;

  const form = root.querySelector('#loginForm') as HTMLFormElement | null;
  const err = root.querySelector('#loginErr') as HTMLElement | null;
  const pwdInput = root.querySelector('#loginPwd') as HTMLInputElement | null;
  const eyeBtn = root.querySelector('#togglePwd') as HTMLButtonElement | null;
  const eyeIcon = root.querySelector('#eyeIcon') as HTMLElement | null;

  // 密码可见性切换
  eyeBtn?.addEventListener('click', () => {
    if (!pwdInput) return;
    const show = pwdInput.type === 'password';
    pwdInput.type = show ? 'text' : 'password';
    if (eyeIcon) eyeIcon.innerHTML = icon(show ? 'eye-off' : 'eye', 16);
  });

  form?.addEventListener('submit', e => {
    e.preventDefault();
    try {
      const u = (root.querySelector('#loginUser') as HTMLInputElement).value.trim();
      const p = (pwdInput as HTMLInputElement).value;
      if (err) err.textContent = '';
      if (!u) {
        const msg = '请输入用户名';
        if (err) err.textContent = msg;
        toast(msg, 'warn');
        return;
      }
      if (!p) {
        const msg = '请输入密码';
        if (err) err.textContent = msg;
        toast(msg, 'warn');
        return;
      }
      const ok = login(u, p);
      if (ok) {
        toast('登录成功，欢迎回来', 'success');
        // 若地址栏已是目标 hash（被守卫弹回登录页时常见），直接赋相同值不会触发 hashchange，
        // 因此无论如何都主动派发一次状态刷新，确保登录层关闭、进入工作台。
        if (window.location.hash === '#/dashboard' || window.location.hash === '') {
          window.location.hash = '#/dashboard';
          window.dispatchEvent(new Event('state:changed'));
        } else {
          window.location.hash = '#/dashboard';
        }
      } else {
        const msg = '用户名或密码不正确，请重试';
        if (err) err.textContent = msg;
        toast(msg, 'warn');
      }
    } catch (ex) {
      console.error('登录异常', ex);
      const msg = '登录失败：浏览器存储不可用，请检查是否禁用了 localStorage';
      if (err) err.textContent = msg;
      toast(msg, 'warn');
    }
  });

  pwdInput?.focus();
}
