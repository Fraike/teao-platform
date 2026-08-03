/**
 * 金蝶云星辰 API 服务层
 * 负责鉴权、签名、Token 管理、业务接口调用
 */
import crypto from "node:crypto";

const CLIENT_ID = process.env.KINGDEE_CLIENT_ID;
const CLIENT_SECRET = process.env.KINGDEE_CLIENT_SECRET;
const BASE_URL = "https://api.kingdee.com";

function ensureCredentials() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("未配置金蝶 API 凭据");
  }
}

// ---- Token 缓存 ----
let cachedToken = null;
let cachedDomain = null;
let tokenExpiresAt = 0; // 毫秒时间戳

// ---- 签名工具 ----

function getPathEncode(str) {
  let result = [];
  for (const c of str) {
    if (c === "/") {
      result.push("%2F");
    } else if (/[a-zA-Z0-9\-_.~]/.test(c)) {
      result.push(c);
    } else {
      result.push(encodeURIComponent(c).toUpperCase());
    }
  }
  return result.join("");
}

function getQueryEncodeForSignature(querys) {
  if (!querys || Object.keys(querys).length === 0) return "";
  const parts = [];
  const keys = Object.keys(querys).sort();
  for (const key of keys) {
    const v = encodeURIComponent(encodeURIComponent(String(querys[key])));
    parts.push(`${key}=${v}`);
  }
  return parts.join("&");
}

function makeXApiSignature(method, path, queryParams, timestamp, nonce) {
  const signContent = [
    method,
    getPathEncode(path),
    getQueryEncodeForSignature(queryParams || {}),
    `x-api-nonce:${nonce}`,
    `x-api-timestamp:${timestamp}`,
  ].join("\n") + "\n";

  const hmacHex = crypto
    .createHmac("sha256", CLIENT_SECRET)
    .update(signContent, "utf8")
    .digest("hex");

  return Buffer.from(hmacHex, "utf8").toString("base64");
}

function makeAppSignature(appKey, appSecret) {
  const hmacHex = crypto
    .createHmac("sha256", appSecret)
    .update(appKey, "utf8")
    .digest("hex");
  return Buffer.from(hmacHex, "utf8").toString("base64");
}

function randomNonce(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function isSuccess(data) {
  return data.errcode === 0 || data.code === 200 || data.code === "200";
}

// ---- 通用 API 调用 ----

export async function callApi(method, path, queryParams = null, body = null, extraHeaders = null, retries = 3) {
  ensureCredentials();
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ts = String(Date.now());
    const nc = randomNonce(10);
    const sig = makeXApiSignature(method, path, queryParams, ts, nc);

    const headers = {
      "Content-Type": "application/json",
      "X-Api-ClientID": CLIENT_ID,
      "X-Api-Auth-Version": "2.0",
      "X-Api-TimeStamp": ts,
      "X-Api-Nonce": nc,
      "X-Api-SignHeaders": "X-Api-Nonce,X-Api-TimeStamp",
      "X-Api-Signature": sig,
    };
    if (extraHeaders) Object.assign(headers, extraHeaders);

    let url = `${BASE_URL}${path}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const qs = Object.keys(queryParams)
        .sort()
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(queryParams[k]))}`)
        .join("&");
      url += "?" + qs;
    }

    const options = { method, headers, signal: AbortSignal.timeout(30000) };
    if (method === "POST" && body !== null) options.body = body;

    try {
      const response = await fetch(url, options);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text, status_code: response.status };
      }

      if (!isSuccess(data) && attempt < retries) {
        console.warn(`[kingdee] 第${attempt}次尝试失败, 1秒后重试...`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return data;
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[kingdee] 网络错误(第${attempt}次): ${err.message}, 1秒后重试...`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
}

// ---- 鉴权 ----

async function getAppKeySecret() {
  const result = await callApi("POST", "/jdyconnector/app_management/push_app_authorize", null, "{}");
  if (!isSuccess(result)) {
    throw new Error(`获取 app_key 失败: ${JSON.stringify(result)}`);
  }
  const item = result.data[0];
  return {
    appKey: item.appKey,
    appSecret: item.appSecret,
    domain: item.domain || "https://tf.jdy.com",
  };
}

async function getAppToken(appKey, appSecret) {
  const appSig = makeAppSignature(appKey, appSecret);
  const result = await callApi("GET", "/jdyconnector/app_management/kingdee_auth_token", {
    app_key: appKey,
    app_signature: appSig,
  });
  if (!isSuccess(result)) {
    throw new Error(`获取 token 失败: ${result.description || JSON.stringify(result)}`);
  }
  return result.data["app-token"];
}

/**
 * 获取有效的 app-token（使用缓存，24h 有效期）
 */
export async function ensureToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return { token: cachedToken, domain: cachedDomain };
  }
  const { appKey, appSecret, domain } = await getAppKeySecret();
  const token = await getAppToken(appKey, appSecret);
  cachedToken = token;
  cachedDomain = domain;
  tokenExpiresAt = now + 23 * 60 * 60 * 1000; // 23h，提前1小时刷新
  console.log("[kingdee] token 已刷新");
  return { token, domain };
}

// ---- 通用分页拉取 ----

export async function fetchAllPages(path, baseParams = {}, pageSize = 100) {
  const { token, domain } = await ensureToken();
  const allRows = [];
  const params = { ...baseParams, page_size: String(pageSize) };

  const first = await callApi("GET", path, { ...params, page: "1" }, null, {
    "app-token": token,
    "X-GW-Router-Addr": domain,
  });

  if (!isSuccess(first)) {
    throw new Error(`获取 ${path} 失败: ${first.description || JSON.stringify(first)}`);
  }

  const data = first.data;
  // 兼容两种格式：{rows, count} 或 直接数组
  const rows = data.rows ?? (Array.isArray(data) ? data : []);
  const totalCount = data.count ?? data.total ?? rows.length;
  allRows.push(...rows);

  const totalPages = Math.ceil(totalCount / pageSize);
  for (let page = 2; page <= totalPages; page++) {
    const result = await callApi("GET", path, { ...params, page: String(page) }, null, {
      "app-token": token,
      "X-GW-Router-Addr": domain,
    });
    if (isSuccess(result)) {
      const r = result.data?.rows ?? (Array.isArray(result.data) ? result.data : []);
      allRows.push(...r);
    }
  }

  return allRows;
}

// ---- 业务接口 ----

/**
 * 获取商品分类列表
 */
export async function fetchCategories() {
  // 优先使用 material_group API
  let groups = [];
  try {
    groups = await fetchAllPages("/jdy/v2/bd/material_group", { enable: "-1" }, 100);
  } catch (e) {
    console.warn("[kingdee] material_group API 失败:", e.message);
  }

  if (groups.length > 0) {
    // 找出 level=1 的父分类，逐个查询其子分类
    const parents = groups.filter((g) => String(g.level) === "1");
    const childrenQueries = await Promise.all(
      parents.map((p) =>
        fetchAllPages("/jdy/v2/bd/material_group", { enable: "-1", parent: p.id }, 100)
      )
    );

    // count 由前端根据 materials 数据计算，后端不再重复拉取
    return parents.map((p, i) => {
      const children = (childrenQueries[i] || []).map((c) => ({
        id: c.id,
        name: c.name,
        number: c.number,
        level: c.level,
        isLeaf: c.is_leaf,
        parent_id: p.id,
        count: 0,
      }));
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        level: p.level,
        isLeaf: p.is_leaf,
        parent_id: "",
        count: 0,
        children,
      };
    });
  }

  // 降级：从商品数据推导分类（也构建两级树）
  console.log("[kingdee] 从商品数据推导分类...");
  const materials = await fetchAllMaterials();
  const catMap = new Map();
  for (const m of materials) {
    if (!m.parent_id) continue;
    if (!catMap.has(m.parent_id)) {
      catMap.set(m.parent_id, {
        id: m.parent_id,
        name: m.parent_name,
        number: m.parent_number,
        count: 0,
      });
    }
    catMap.get(m.parent_id).count++;
  }
  return Array.from(catMap.values()).sort((a, b) => b.count - a.count);
}

/**
 * 获取全部商品列表
 */
export async function fetchAllMaterials(options = {}) {
  const { search, categoryId } = options;
  const baseParams = { enable: "-1" };
  if (search) baseParams.search = search;
  if (categoryId) baseParams.parent = categoryId;
  return fetchAllPages("/jdy/v2/bd/material", baseParams);
}

/**
 * 获取单个商品详情
 */
export async function fetchMaterialDetail(id) {
  const { token, domain } = await ensureToken();
  const result = await callApi(
    "GET",
    "/jdy/v2/bd/material_detail",
    { id },
    null,
    {
      "app-token": token,
      "X-GW-Router-Addr": domain,
    }
  );
  if (!result.data) {
    throw new Error(`获取商品详情失败: ${result.description || JSON.stringify(result)}`);
  }
  return result.data;
}

/**
 * 获取全部客户列表
 */
export async function fetchAllCustomers(options = {}) {
  const { search } = options;
  const baseParams = { enable: "-1" };
  if (search) baseParams.search = search;
  return fetchAllPages("/jdy/v2/bd/customer", baseParams);
}

/**
 * 获取全部供应商列表
 */
export async function fetchAllSuppliers(options = {}) {
  const { search } = options;
  const baseParams = { enable: "-1" };
  if (search) baseParams.search = search;
  return fetchAllPages("/jdy/v2/bd/supplier", baseParams);
}

/** 获取外部商品库（客户商品资料） */
export async function fetchOutsideMaterials(options = {}) {
  const { search, type } = options;
  const baseParams = {};
  if (search) baseParams.search = search;
  if (type) baseParams.type = type; // 1:供应商 2:客户
  return fetchAllPages("/jdy/v2/bd/outside_material", baseParams);
}
