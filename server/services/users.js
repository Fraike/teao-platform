import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "node:url";
import { createMutex } from "../lib/mutex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDataDir() {
  const envDir = process.env.DATA_DIR;
  if (envDir) return envDir;
  // Try production path
  const prodDir = "/var/www/teao-platform/data";
  try {
    if (!fs.existsSync(prodDir)) fs.mkdirSync(prodDir, { recursive: true });
    return prodDir;
  } catch {
    // Fall back to project-relative data directory
    const localDir = path.resolve(__dirname, "../../data");
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    console.log(`[auth] using local data dir: ${localDir}`);
    return localDir;
  }
}

const DATA_DIR = resolveDataDir();
const USERS_FILE = path.join(DATA_DIR, "users.json");
const JWT_SECRET = process.env.JWT_SECRET;
const isPlaceholderSecret = !JWT_SECRET || JWT_SECRET.length < 32 || /^(change-me|your[-_ ]?secret|replace-me)/i.test(JWT_SECRET);
if (isPlaceholderSecret && process.env.NODE_ENV !== "development") {
  console.error("[auth] FATAL: JWT_SECRET must be a non-placeholder secret of at least 32 characters");
  console.error("[auth] Set it via: export JWT_SECRET=<random-32-plus-character-secret>");
  process.exit(1);
}
if (isPlaceholderSecret) {
  console.warn("[auth] WARNING: development is using an insecure JWT_SECRET");
}
const SESSION_DURATION_SECONDS = 15 * 24 * 60 * 60;

const DEFAULT_PERMISSIONS = ["business", "production", "tools"];
const ALL_PERMISSIONS = ["business", "production", "production_import", "hr", "tools", "admin", "basic_data", "engineering", "engineering_submit", "engineering_review"];

const userMutex = createMutex();

function readUsersUnsafe() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const users = parsed.users || [];

    // migrate: add default permissions to users without them
    let migrated = false;
    for (const u of users) {
      if (!u.permissions) {
        u.permissions = u.role === "admin" ? [...ALL_PERMISSIONS] : [...DEFAULT_PERMISSIONS];
        migrated = true;
      }
      if (typeof u.passwordVersion !== "number") {
        u.passwordVersion = 0;
        migrated = true;
      }
      if (typeof u.wecomUserid !== "string") {
        u.wecomUserid = "";
        migrated = true;
      }
    }
    if (migrated) writeUsersUnsafe(users);

    return users;
  } catch {
    return [];
  }
}

function writeUsersUnsafe(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), "utf-8");
}

// Thread-safe wrappers
async function readUsers() {
  return userMutex.run(() => readUsersUnsafe());
}

async function writeUsers(users) {
  return userMutex.run(() => writeUsersUnsafe(users));
}

async function withUsers(fn) {
  return userMutex.run(async () => {
    const users = readUsersUnsafe();
    const result = await fn(users);
    writeUsersUnsafe(users);
    return result;
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString("hex") === hash);
    });
  });
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

function isRecoveryCodeValid(input) {
  const configured = process.env.ADMIN_RECOVERY_CODE;
  if (!configured || configured.length < 32 || typeof input !== "string") return false;
  const expected = Buffer.from(configured);
  const received = Buffer.from(input);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function issueToken(user, rememberLogin = false, sessionStartedAt = Math.floor(Date.now() / 1000), expiresAt = sessionStartedAt + SESSION_DURATION_SECONDS) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      passwordVersion: user.passwordVersion || 0,
      rememberLogin,
      sessionStartedAt,
      sessionExpiresAt: expiresAt,
      exp: expiresAt,
    },
    JWT_SECRET,
  );
}

function generateId() {
  return `u_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

// ---- public API ----

export async function initDefaultAdmin() {
  await userMutex.run(async () => {
    const users = readUsersUnsafe();
    if (users.some((u) => u.role === "admin")) return;

    let initialPassword = "admin123";
    if (process.env.NODE_ENV === "production") {
      initialPassword = process.env.INITIAL_ADMIN_PASSWORD || "";
      if (initialPassword.length < 12 || !/[a-zA-Z]/.test(initialPassword) || !/\d/.test(initialPassword)) {
        throw new Error("生产环境首次启动必须配置至少 12 位且包含字母和数字的 INITIAL_ADMIN_PASSWORD");
      }
    }

    users.push({
      id: generateId(),
      name: "管理员",
      username: "admin",
      passwordHash: await hashPassword(initialPassword),
      role: "admin",
      status: "active",
      permissions: [...ALL_PERMISSIONS],
      wecomUserid: "",
      passwordVersion: 0,
      createdAt: new Date().toISOString(),
    });
    writeUsersUnsafe(users);
    console.log(`[auth] default admin created (${process.env.NODE_ENV === "production" ? "production credentials" : "admin / admin123"})`);
  });
}

export async function registerUser({ name, username, password }) {
  return withUsers(async (users) => {
    if (users.some((u) => u.username === username)) {
      return { error: "用户名已存在" };
    }
    const passwordHash = await hashPassword(password);
    const user = {
      id: generateId(),
      name,
      username,
      passwordHash,
      role: "user",
      status: "pending",
      permissions: [...DEFAULT_PERMISSIONS],
      wecomUserid: "",
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    return { ok: true };
  });
}

export async function loginUser({ username, password, rememberLogin = false }) {
  return withUsers(async (users) => {
    const user = users.find((u) => u.username === username);
    if (!user) return { error: "用户名或密码错误" };
    if (user.status !== "active") return { error: "账号尚未通过审核，请联系管理员" };
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return { error: "用户名或密码错误" };

    const token = issueToken(user, rememberLogin === true);
    return {
      token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions: user.permissions },
    };
  });
}

/** Resolve current authorization fields using the same read that validates the session. */
export function getTokenSessionUser(token) {
  try {
    const payload = typeof token === "string" ? jwt.verify(token, JWT_SECRET) : token;
    if (!Number.isFinite(sessionDeadline(payload)) || Date.now() / 1000 >= sessionDeadline(payload)) {
      return null;
    }
    const user = readUsersUnsafe().find((item) => item.id === payload.id);
    if (!user || user.status !== "active" || (user.passwordVersion || 0) !== (payload.passwordVersion || 0)) {
      return null;
    }
    // Only authorization fields may replace claims; never copy stored session or private fields.
    return { id: user.id, username: user.username, role: user.role, permissions: user.permissions };
  } catch {
    return null;
  }
}

export function isTokenSessionValid(token) {
  return Boolean(getTokenSessionUser(token));
}

export async function recoverAdminPassword({ username, recoveryCode, newPassword }) {
  if (!isRecoveryCodeValid(recoveryCode)) return { error: "管理员恢复信息无效" };
  if (!isValidPassword(newPassword)) return { error: "密码必须至少6位且包含字母和数字" };
  return withUsers(async (users) => {
    const admins = users.filter((item) => item.role === "admin" && item.status === "active");
    const user = username ? admins.find((item) => item.username === username) : admins.length === 1 ? admins[0] : null;
    if (!user) return { error: "管理员恢复信息无效" };
    user.passwordHash = await hashPassword(newPassword);
    user.passwordVersion = (user.passwordVersion || 0) + 1;
    return { ok: true };
  });
}

export async function changeAdminPassword({ userId, currentPassword, newPassword, rememberLogin = false, sessionStartedAt, sessionExpiresAt }) {
  if (!isValidPassword(newPassword)) return { error: "密码必须至少6位且包含字母和数字" };
  return withUsers(async (users) => {
    const user = users.find((item) => item.id === userId && item.role === "admin" && item.status === "active");
    if (!user || !(await verifyPassword(currentPassword || "", user.passwordHash))) return { error: "当前密码错误" };
    user.passwordHash = await hashPassword(newPassword);
    user.passwordVersion = (user.passwordVersion || 0) + 1;
    return { ok: true, token: issueToken(user, rememberLogin === true, sessionStartedAt, sessionExpiresAt) };
  });
}

export function getUserById(id) {
  const users = readUsersUnsafe(); // read-only, no lock needed
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  return { id: user.id, name: user.name, username: user.username, role: user.role, status: user.status, permissions: user.permissions || DEFAULT_PERMISSIONS, wecomUserid: user.wecomUserid || "" };
}

export function hasProductionImportAccess(id) {
  const user = getUserById(id);
  return Boolean(user?.status === "active" && (user.role === "admin" ||
    (user.permissions.includes("production") && user.permissions.includes("production_import"))));
}

export function listUsers() {
  return readUsersUnsafe().map(({ passwordHash, passwordResetRequest, ...u }) => ({
    ...u,
    ...(passwordResetRequest ? { passwordResetRequest: { id: passwordResetRequest.id, requestedAt: passwordResetRequest.requestedAt } } : {}),
  }));
}

const PASSWORD_RECOVERY_VALID_MS = 7 * 24 * 60 * 60 * 1000;

export function listPasswordRecoveryRequests() {
  return readUsersUnsafe().filter(u => u.role !== "admin" && u.status === "active" && u.passwordResetRequest)
    .map(u => ({ id: u.id, name: u.name, username: u.username, requestedAt: u.passwordResetRequest.requestedAt }));
}

export async function requestUserPasswordRecovery({ name, newPassword }) {
  if (typeof name !== "string" || !name.trim() || name.length > 100) return { error: "请输入注册时的真实姓名" };
  if (!isValidPassword(newPassword) || newPassword.length > 128) return { error: "密码需6-128位，且包含字母和数字" };
  return withUsers(async (users) => {
    const matches = users.filter(u => u.role !== "admin" && u.status === "active" && typeof u.name === "string" && u.name.trim() === name.trim());
    if (matches.length > 1) return { error: "存在同名账号，请联系管理员重置密码" };
    if (matches.length !== 1) return { error: "未找到对应的已激活普通账号，请核对真实姓名或联系管理员" };
    const user = matches[0];
    if (user.passwordResetRequest && Date.now() - Date.parse(user.passwordResetRequest.requestedAt) < PASSWORD_RECOVERY_VALID_MS) {
      return { error: "已有找回密码申请待审核，请联系管理员处理" };
    }
    user.passwordResetRequest = {
      id: crypto.randomUUID(), requestedAt: new Date().toISOString(),
      passwordHash: await hashPassword(newPassword), passwordVersion: user.passwordVersion || 0,
    };
    return { ok: true };
  });
}

export async function reviewUserPasswordRecovery(id, { requestId, approve }, actorId) {
  if (typeof approve !== "boolean" || typeof requestId !== "string") return { error: "审核参数错误" };
  return withUsers(async (users) => {
    if (!users.some(u => u.id === actorId && u.role === "admin" && u.status === "active")) return { error: "仅管理员可以审核" };
    const user = users.find(u => u.id === id && u.role !== "admin" && u.status === "active");
    const request = user?.passwordResetRequest;
    if (!request || request.id !== requestId) return { error: "申请已处理或已变更，请刷新后重试" };
    if (approve && (Date.now() - Date.parse(request.requestedAt) >= PASSWORD_RECOVERY_VALID_MS || !Number.isFinite(Date.parse(request.requestedAt)) || request.passwordVersion !== (user.passwordVersion || 0))) {
      return { error: "申请已过期或账号密码已变更，请重新申请" };
    }
    if (approve) {
      user.passwordHash = request.passwordHash;
      user.passwordVersion = (user.passwordVersion || 0) + 1;
    }
    user.lastPasswordRecoveryReview = { requestId, requestedAt: request.requestedAt, reviewedAt: new Date().toISOString(), reviewedBy: actorId, approved: approve };
    delete user.passwordResetRequest;
    return { ok: true };
  });
}

/** 审核人：激活状态且为 admin 或拥有 engineering_review 权限的用户。 */
export function listReviewers() {
  return readUsersUnsafe()
    .filter((u) => u.status === "active" && (u.role === "admin" || (u.permissions || []).includes("engineering_review")))
    .map((u) => ({ id: u.id, name: u.name, wecomUserid: u.wecomUserid || "" }));
}

/** 按姓名反查用户（审核结果提醒时定位提交人的企微账号）。 */
export function findUserByName(name) {
  const user = readUsersUnsafe().find((u) => u.name === name);
  if (!user) return null;
  return { id: user.id, name: user.name, username: user.username, wecomUserid: user.wecomUserid || "" };
}

export async function setUserWecomUserid(id, value) {
  return withUsers(async (users) => {
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return { error: "用户不存在" };
    users[idx].wecomUserid = typeof value === "string" ? value.trim() : "";
    return { ok: true, wecomUserid: users[idx].wecomUserid };
  });
}

export async function approveUser(id) {
  return withUsers(async (users) => {
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return { error: "用户不存在" };
    if (users[idx].role === "admin") return { error: "不能审核管理员" };
    users[idx].status = "active";
    return { ok: true };
  });
}

export async function rejectUser(id) {
  return withUsers(async (users) => {
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return { error: "用户不存在" };
    if (users[idx].role === "admin") return { error: "不能驳回管理员" };
    users.splice(idx, 1);
    return { ok: true };
  });
}

export async function resetUserPassword(id, newPassword) {
  return withUsers(async (users) => {
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return { error: "用户不存在" };
    if (users[idx].role === "admin") return { error: "不能重置管理员密码" };
    if (users[idx].status !== "active") return { error: "该账号尚未激活，请联系管理员" };
    if (!newPassword) return { error: "请输入新密码" };
    if (newPassword.length < 6) return { error: "密码至少 6 位" };
    if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return { error: "密码必须同时包含字母和数字" };
    }
    users[idx].passwordHash = await hashPassword(newPassword);
    users[idx].passwordVersion = (users[idx].passwordVersion || 0) + 1;
    delete users[idx].passwordResetRequest;
    return { ok: true, reset: true };
  });
}

export async function setUserPermission(id, permission, enabled) {
  if (!ALL_PERMISSIONS.includes(permission) || permission === "admin") return { error: "无效的权限" };
  return withUsers(async (users) => {
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return { error: "用户不存在" };
    if (users[idx].role === "admin") return { error: "不能修改管理员权限" };
    if (!users[idx].permissions) users[idx].permissions = [...DEFAULT_PERMISSIONS];
    if (enabled) {
      if (!users[idx].permissions.includes(permission)) users[idx].permissions.push(permission);
    } else {
      users[idx].permissions = users[idx].permissions.filter((p) => p !== permission);
    }
    return { ok: true, permissions: users[idx].permissions };
  });
}

/** Only active remembered sessions can renew their token. */
function sessionDeadline(payload) {
  const start = payload.sessionStartedAt ?? payload.iat;
  if (!Number.isFinite(start) || (payload.exp !== undefined && !Number.isFinite(payload.exp))) return NaN;
  return Math.min(payload.exp ?? Infinity, start + SESSION_DURATION_SECONDS, payload.sessionExpiresAt ?? Infinity);
}

export function refreshToken(oldToken) {
  try {
    const payload = jwt.verify(oldToken, JWT_SECRET);
    if (payload.rememberLogin !== true) return { error: "登录状态已失效，请重新登录" };
    if (!isTokenSessionValid(payload)) return { error: "登录状态已失效，请重新登录" };
    const user = readUsersUnsafe().find((item) => item.id === payload.id);
    if (!user || user.status !== "active" || (user.passwordVersion || 0) !== (payload.passwordVersion || 0)) {
      return { error: "登录状态已失效，请重新登录" };
    }
    const newToken = issueToken(user, true, payload.sessionStartedAt ?? payload.iat, sessionDeadline(payload));
    return { token: newToken };
  } catch {
    return { error: "登录状态已失效，请重新登录" };
  }
}

export { JWT_SECRET };
