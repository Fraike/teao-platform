/**
 * 金蝶云星辰 API 连通性测试脚本
 * 按照文档三步鉴权流程验证
 */

const crypto = require('crypto');

// ==================== 配置 ====================
const CLIENT_ID = process.env.KINGDEE_CLIENT_ID;
const CLIENT_SECRET = process.env.KINGDEE_CLIENT_SECRET;
const BASE_URL = "https://api.kingdee.com";

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("请先设置 KINGDEE_CLIENT_ID 和 KINGDEE_CLIENT_SECRET 环境变量");
    process.exit(1);
}

// ==================== 签名工具 ====================

/**
 * 路径编码：/ → %2F，字母数字和 -_.~ 保持原样
 */
function getPathEncode(path) {
    let result = [];
    for (const c of path) {
        if (c === '/') {
            result.push('%2F');
        } else if (/[a-zA-Z0-9\-_.~]/.test(c)) {
            result.push(c);
        } else {
            result.push(encodeURIComponent(c).toUpperCase());
        }
    }
    return result.join('');
}

/**
 * 签名用 query 编码：key 不编码，value 进行 2 次 URL 编码，按 key ASCII 升序排列
 */
function getQueryEncodeForSignature(querys) {
    if (!querys || Object.keys(querys).length === 0) {
        return "";
    }
    const parts = [];
    const keys = Object.keys(querys).sort();
    for (const key of keys) {
        const v = encodeURIComponent(encodeURIComponent(String(querys[key])));
        parts.push(`${key}=${v}`);
    }
    return parts.join("&");
}

/**
 * 生成 X-Api-Signature
 */
function makeXApiSignature(method, path, queryParams, clientSecret, timestamp, nonce) {
    const signContent = [
        method,
        getPathEncode(path),
        getQueryEncodeForSignature(queryParams || {}),
        `x-api-nonce:${nonce}`,
        `x-api-timestamp:${timestamp}`,
    ].join("\n") + "\n";

    const hmacHex = crypto
        .createHmac("sha256", clientSecret)
        .update(signContent, "utf8")
        .digest("hex");

    return Buffer.from(hmacHex, "utf8").toString("base64");
}

/**
 * 生成 app_signature（用于获取 token 接口）
 */
function makeAppSignature(appKey, appSecret) {
    const hmacHex = crypto
        .createHmac("sha256", appSecret)
        .update(appKey, "utf8")
        .digest("hex");

    return Buffer.from(hmacHex, "utf8").toString("base64");
}

/**
 * 生成随机字符串
 */
function randomNonce(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

/**
 * 通用 API 调用
 */
async function callApi(method, path, queryParams = null, body = null, extraHeaders = null) {
    const ts = String(Date.now());
    const nc = randomNonce(10);
    const sig = makeXApiSignature(method, path, queryParams, CLIENT_SECRET, ts, nc);

    const headers = {
        "Content-Type": "application/json",
        "X-Api-ClientID": CLIENT_ID,
        "X-Api-Auth-Version": "2.0",
        "X-Api-TimeStamp": ts,
        "X-Api-Nonce": nc,
        "X-Api-SignHeaders": "X-Api-Nonce,X-Api-TimeStamp",
        "X-Api-Signature": sig,
    };

    if (extraHeaders) {
        Object.assign(headers, extraHeaders);
    }

    let url = `${BASE_URL}${path}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
        const qs = Object.keys(queryParams)
            .sort()
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(queryParams[k]))}`)
            .join("&");
        url += "?" + qs;
    }

    console.log(`\n📡 ${method} ${url}`);
    console.log(`   Headers: X-Api-TimeStamp=${ts}, X-Api-Nonce=${nc}`);

    const options = {
        method,
        headers,
        timeout: 20000,
    };

    if (method === "POST" && body !== null) {
        options.body = body;
    }

    const response = await fetch(url, options);
    const text = await response.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text, status_code: response.status };
    }

    return data;
}

// ==================== 核心业务函数 ====================

/**
 * Step1: 获取最新 app_key, app_secret, domain
 */
async function getAppKeySecret() {
    console.log("\n═══════════════════════════════════════");
    console.log("  Step 1: 获取 app_key / app_secret");
    console.log("═══════════════════════════════════════");

    const result = await callApi("POST", "/jdyconnector/app_management/push_app_authorize", null, "{}");

    console.log("  响应:", JSON.stringify(result, null, 2));

    if (result.errcode !== 0) {
        throw new Error(`获取 app_key 失败: ${JSON.stringify(result)}`);
    }

    const dataList = result.data;
    if (!Array.isArray(dataList) || dataList.length === 0) {
        throw new Error(`data 为空: ${JSON.stringify(result)}`);
    }

    const item = dataList[0];
    return {
        appKey: item.appKey,
        appSecret: item.appSecret,
        domain: item.domain || "https://tf.jdy.com",
        companyName: item.agreementCompanyName,
        instanceId: item.outerInstanceId,
    };
}

/**
 * Step2: 用 app_key + app_secret 换取 app-token
 */
async function getAppToken(appKey, appSecret) {
    console.log("\n═══════════════════════════════════════");
    console.log("  Step 2: 获取 app-token");
    console.log("═══════════════════════════════════════");

    const appSig = makeAppSignature(appKey, appSecret);
    console.log(`   app_signature: ${appSig}`);

    const result = await callApi("GET", "/jdyconnector/app_management/kingdee_auth_token", {
        app_key: appKey,
        app_signature: appSig,
    });

    console.log("  响应:", JSON.stringify(result, null, 2));

    if (result.errcode !== 0) {
        throw new Error(`获取 token 失败: ${result.description || JSON.stringify(result)}`);
    }

    return {
        appToken: result.data["app-token"],
        uid: result.data.uid,
    };
}

/**
 * Step3: 获取商品列表
 */
async function getMaterialList(appToken, domain, page = 1, pageSize = 10, enable = "-1") {
    console.log("\n═══════════════════════════════════════");
    console.log("  Step 3: 获取商品列表（连通性验证）");
    console.log("═══════════════════════════════════════");

    const params = {
        page: String(page),
        page_size: String(pageSize),
        enable: enable,
    };

    const result = await callApi(
        "GET",
        "/jdy/v2/bd/material",
        params,
        null,
        {
            "app-token": appToken,
            "X-GW-Router-Addr": domain,
        }
    );

    console.log("  响应:", JSON.stringify(result, null, 2));

    return result;
}

// ==================== 主程序 ====================

async function main() {
    console.log("╔══════════════════════════════════════════╗");
    console.log("║   金蝶云星辰 API 连通性测试              ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`  Client ID: ${CLIENT_ID}`);
    console.log(`  Base URL:  ${BASE_URL}`);
    console.log(`  时间:      ${new Date().toISOString()}`);

    const startTime = Date.now();

    try {
        // Step 1: 获取 app_key/app_secret
        const { appKey, appSecret, domain, companyName } = await getAppKeySecret();
        console.log(`\n  ✅ Step1 成功: appKey=${appKey}, domain=${domain}`);
        console.log(`  公司: ${companyName}`);

        // Step 2: 获取 app-token
        const { appToken, uid } = await getAppToken(appKey, appSecret);
        console.log(`\n  ✅ Step2 成功: uid=${uid}`);
        console.log(`  token 前50字符: ${appToken.substring(0, 50)}...`);

        // Step 3: 获取商品列表（验证业务接口连通性）
        const result = await getMaterialList(appToken, domain, 1, 10, "-1");

        if (result.errcode === 0) {
            const data = result.data;
            console.log(`\n  ✅ Step3 成功！`);
            console.log(`  商品总数: ${data.count}`);
            console.log(`  本次返回: ${data.rows.length} 条`);
            console.log(`\n  前几条商品:`);
            for (const item of data.rows.slice(0, 5)) {
                console.log(`    [${item.number}] ${item.name} - ${item.base_unit_name}`);
            }
        } else {
            console.log(`\n  ❌ Step3 失败: ${JSON.stringify(result)}`);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n═══════════════════════════════════════`);
        console.log(`  🎉 测试完成! 耗时: ${elapsed}s`);
        console.log(`═══════════════════════════════════════`);

    } catch (error) {
        console.error(`\n  ❌ 测试失败: ${error.message}`);
        process.exit(1);
    }
}

main();
