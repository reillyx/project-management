// 纯本地鉴权：localStorage 保存登录态、账号密码与个人资料（无服务端鉴权）

const AUTH_KEY = 'pm_auth_v1';

export interface Profile {
  name: string;
  phone: string;
  email: string;
  avatar: string; // dataURL 或空字符串
}

export interface AuthData {
  username: string;
  password: string;
  loggedIn: boolean;
  profile: Profile;
  theme: string; // 预留：目前仅 light
  language: string; // 预留：zh-CN
}

function defaultData(): AuthData {
  return {
    username: 'admin',
    password: '123456',
    loggedIn: false,
    profile: { name: '张启凡', phone: '', email: '', avatar: '' },
    theme: 'light',
    language: 'zh-CN',
  };
}

function load(): AuthData {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw) as Partial<AuthData>;
    return { ...defaultData(), ...parsed, profile: { ...defaultData().profile, ...(parsed.profile ?? {}) } };
  } catch {
    return defaultData();
  }
}

function save(data: AuthData): void {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
  } catch {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: '数据保存失败，请检查浏览器存储' }));
  }
}

export function isLoggedIn(): boolean {
  return load().loggedIn === true;
}

export function currentUser(): string {
  return load().username;
}

export function getProfile(): Profile {
  return load().profile;
}

export function getAuthData(): AuthData {
  return load();
}

/** 校验账号密码并建立登录态；返回是否成功 */
export function login(username: string, password: string): boolean {
  const data = load();
  if (username.trim() !== data.username || password !== data.password) return false;
  data.loggedIn = true;
  save(data);
  return true;
}

export function logout(): void {
  const data = load();
  data.loggedIn = false;
  save(data);
}

/** 修改密码：旧密码需匹配 */
export function changePassword(oldPwd: string, newPwd: string): { ok: boolean; msg: string } {
  const data = load();
  if (oldPwd !== data.password) return { ok: false, msg: '原密码不正确' };
  if (newPwd.length < 6) return { ok: false, msg: '新密码至少 6 位' };
  data.password = newPwd;
  save(data);
  return { ok: true, msg: '密码已更新' };
}

export function saveProfile(profile: Profile): void {
  const data = load();
  data.profile = profile;
  save(data);
}
