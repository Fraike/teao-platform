# 金蝶云星辰 API 开发文档

> 本文档面向开发者，记录了金蝶云星辰开放平台（open.jdy.com / api.kingdee.com）的完整鉴权流程和业务接口调用方法，并附有经过真实验证的 Python 实现代码。

---

## 一、基础信息

| 项目 | 值 |
|------|------|
| 开放平台 | https://open.jdy.com |
| API 网关 | https://api.kingdee.com |
| 业务域名（IDC域名）| https://tf.jdy.com（具体以 push_app_authorize 返回的 `domain` 字段为准）|
| Client ID | 使用环境变量 `KINGDEE_CLIENT_ID` 配置 |
| Client Secret | 使用环境变量 `KINGDEE_CLIENT_SECRET` 配置 |
| 鉴权协议版本 | 2.0 |

> ⚠️ **重要安全提示**：`client_secret` 是私密凭证，请勿提交到版本控制系统或暴露在前端代码中。

---

## 二、完整鉴权流程（三步走）

```
Step1: POST /jdyconnector/app_management/push_app_authorize
       → 获取 app_key、app_secret、domain
                    ↓
Step2: GET  /jdyconnector/app_management/kingdee_auth_token
       → 获取 app-token（24小时有效）
                    ↓
Step3: GET  /jdy/v2/bd/material（或其他业务接口）
       → 携带 app-token 调用业务接口
```

---

## 三、签名算法详解

所有接口（包括鉴权接口）都需要在请求头中携带 `X-Api-Signature`，这是最核心也最容易出错的部分。

### 3.1 X-Api-Signature 生成规则

```
签名原文 = Method + "\n"
         + PathEncoded + "\n"
         + QueryStringEncoded + "\n"
         + "x-api-nonce:" + nonce + "\n"
         + "x-api-timestamp:" + timestamp + "\n"

X-Api-Signature = Base64( HMAC-SHA256(key=client_secret, msg=签名原文).hexdigest() )
```

**关键细节：**

1. **路径编码（PathEncoded）**：`/` 必须编码为 `%2F`，字母数字和 `-_.~` 保持原样，其他字符做标准 URL 编码并转大写。

2. **QueryString 编码**：参数名不编码，参数值进行**两次** URL 编码（double encode）；参数按 key 的 ASCII 升序排列，格式为 `key1=value1&key2=value2`。

3. **HMAC 算法**：先做 HMAC-SHA256 得到字节，再转成 **hex 字符串**（hexdigest），最后对 hex 字符串做 Base64 编码（不是对原始字节做 Base64！这是常见错误）。

4. **X-Api-SignHeaders**：固定传 `X-Api-Nonce,X-Api-TimeStamp`（注意：Nonce 在前，TimeStamp 在后，按字母序排列）。

### 3.2 app_signature 生成规则（Step2 专用）

获取 token 时，URL 参数中需要传 `app_signature`，生成方式：

```
app_signature = Base64( HMAC-SHA256(key=app_secret, msg=app_key).hexdigest() )
```

### 3.3 Python 实现（经验证可用）

```python
import hmac
import hashlib
import base64
import urllib.parse
import time
import random
import string

def get_path_encode(path: str) -> str:
    """路径编码：/ → %2F，字母数字和 -_.~ 保持原样"""
    result = []
    for c in path:
        if c == '/':
            result.append('%2F')
        elif c.isalnum() or c in '-_.~':
            result.append(c)
        else:
            result.append(urllib.parse.quote(c).upper())
    return ''.join(result)


def get_query_encode_for_signature(querys: dict) -> str:
    """签名用 query 编码：key 不编码，value 进行 2 次 URL 编码，按 key ASCII 升序排列"""
    if not querys:
        return ""
    parts = []
    for key, value in sorted(querys.items()):
        v = urllib.parse.quote(urllib.parse.quote(str(value), safe=''), safe='')
        parts.append(f"{key}={v}")
    return "&".join(parts)


def make_x_api_signature(method: str, path: str, query_params: dict,
                          client_secret: str, timestamp: str, nonce: str) -> str:
    """生成 X-Api-Signature"""
    sign_content = "\n".join([
        method,
        get_path_encode(path),
        get_query_encode_for_signature(query_params or {}),
        f"x-api-nonce:{nonce}",
        f"x-api-timestamp:{timestamp}",
    ]) + "\n"
    
    hmac_hex = hmac.new(
        client_secret.encode("utf-8"),
        sign_content.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return base64.b64encode(hmac_hex.encode("utf-8")).decode("utf-8")


def make_app_signature(app_key: str, app_secret: str) -> str:
    """生成 app_signature（用于获取 token 接口）"""
    hmac_hex = hmac.new(
        app_secret.encode("utf-8"),
        app_key.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return base64.b64encode(hmac_hex.encode("utf-8")).decode("utf-8")
```

---

## 四、接口详情

### 4.1 Step1：获取 app_key/app_secret

| 项目 | 值 |
|------|------|
| **请求方式** | POST |
| **接口地址** | `https://api.kingdee.com/jdyconnector/app_management/push_app_authorize` |
| **请求体** | `{}` （空 JSON） |

**请求头（Headers）：**

| 参数名 | 说明 | 示例 |
|--------|------|------|
| Content-Type | 固定 | `application/json` |
| X-Api-ClientID | 应用 ID | `KINGDEE_CLIENT_ID` |
| X-Api-Auth-Version | 固定 | `2.0` |
| X-Api-TimeStamp | 当前毫秒时间戳 | `1749196154000` |
| X-Api-Nonce | 随机字符串（10位字母数字） | `aB3xK8mNpQ` |
| X-Api-SignHeaders | 固定 | `X-Api-Nonce,X-Api-TimeStamp` |
| X-Api-Signature | 按 3.1 规则生成 | （动态生成） |

**成功响应示例：**

```json
{
  "errcode": 0,
  "description": "成功",
  "data": [
    {
      "appKey": "hMy535BF",
      "appSecret": "002e2d70c51ab8d3845efd5d67070147df263e78",
      "domain": "https://tf.jdy.com",
      "agreementCompanyName": "东莞市特澳电子科技有限公司",
      "outerInstanceId": "467752488729186304"
    }
  ]
}
```

> ⚠️ **关键注意**：`appSecret` **每次调用都可能轮换**，必须每次动态获取，不能缓存！

---

### 4.2 Step2：获取 app-token

| 项目 | 值 |
|------|------|
| **请求方式** | GET |
| **接口地址** | `https://api.kingdee.com/jdyconnector/app_management/kingdee_auth_token` |

**请求头（Headers）：**

与 Step1 相同（X-Api-Signature 需根据本次请求重新生成）。

**URL 参数（Query Params）：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| app_key | string | 是 | Step1 获取到的 appKey |
| app_signature | string | 是 | 按 3.2 规则生成 |
| uid | string | 否 | 不传默认返回账套管理员 token |

**成功响应示例：**

```json
{
  "errcode": 0,
  "description": "成功",
  "data": {
    "uid": 141861382,
    "app-token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

> **app-token 有效期为 24 小时**，可以缓存复用，到期后重新执行 Step1+Step2。

---

### 4.3 Step3：获取商品列表

| 项目 | 值 |
|------|------|
| **请求方式** | GET |
| **接口地址** | `https://api.kingdee.com/jdy/v2/bd/material` |

**请求头（Headers）：**

除通用签名头外，业务接口需要额外两个 header：

| 额外参数名 | 说明 | 示例 |
|-----------|------|------|
| app-token | Step2 获取到的 token | `eyJhbGci...` |
| X-GW-Router-Addr | Step1 返回的 domain 字段 | `https://tf.jdy.com` |

**URL 参数（Query Params）：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| page | string | 否 | 当前页，默认 1 |
| page_size | string | 否 | 每页条数，默认 10 |
| enable | string | 否 | `1`=可用，`0`=禁用，`-1`=全部（默认查可用） |
| search | string | 否 | 模糊搜索名称 |
| ids | array | 否 | 按商品 ID 查询 |
| parent | array | 否 | 按上级分类 ID 查询 |
| create_start_time | string | 否 | 创建时间范围-开始（毫秒时间戳） |
| create_end_time | string | 否 | 创建时间范围-结束（毫秒时间戳） |
| modify_start_time | string | 否 | 修改时间范围-开始（毫秒时间戳） |
| modify_end_time | string | 否 | 修改时间范围-结束（毫秒时间戳） |
| show_units | boolean | 否 | 是否返回多单位信息，默认 false |
| is_data_perm | boolean | 否 | 是否添加数据权限校验，默认 false |

**成功响应示例：**

```json
{
  "errcode": 0,
  "description": "success",
  "data": {
    "count": 1147,
    "rows": [
      {
        "id": "xxx",
        "number": "Q0040",
        "name": "0型圈3.95*2.65*0.65棕红色-硅胶/SIL55A",
        "base_unit_name": "个",
        "parent_name": "O型圈"
      }
    ]
  }
}
```

---

## 五、完整 Python 示例代码

以下是经过真实验证、可直接运行的完整代码：

```python
"""
金蝶云星辰 API 调用 - 完整流程（已验证可用）
依赖：pip install requests
"""

import hmac
import hashlib
import base64
import time
import requests
import urllib.parse
import json
import random
import string
import os

# ==================== 配置 ====================
CLIENT_ID     = os.environ["KINGDEE_CLIENT_ID"]
CLIENT_SECRET = os.environ["KINGDEE_CLIENT_SECRET"]
BASE_URL      = "https://api.kingdee.com"


# ==================== 签名工具 ====================

def get_path_encode(path: str) -> str:
    result = []
    for c in path:
        if c == '/':
            result.append('%2F')
        elif c.isalnum() or c in '-_.~':
            result.append(c)
        else:
            result.append(urllib.parse.quote(c).upper())
    return ''.join(result)


def get_query_encode_for_signature(querys: dict) -> str:
    if not querys:
        return ""
    parts = []
    for key, value in sorted(querys.items()):
        v = urllib.parse.quote(urllib.parse.quote(str(value), safe=''), safe='')
        parts.append(f"{key}={v}")
    return "&".join(parts)


def make_x_api_signature(method, path, query_params, client_secret, timestamp, nonce):
    sign_content = "\n".join([
        method,
        get_path_encode(path),
        get_query_encode_for_signature(query_params or {}),
        f"x-api-nonce:{nonce}",
        f"x-api-timestamp:{timestamp}",
    ]) + "\n"
    hmac_hex = hmac.new(
        client_secret.encode("utf-8"),
        sign_content.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return base64.b64encode(hmac_hex.encode("utf-8")).decode("utf-8")


def make_app_signature(app_key: str, app_secret: str) -> str:
    hmac_hex = hmac.new(
        app_secret.encode("utf-8"),
        app_key.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return base64.b64encode(hmac_hex.encode("utf-8")).decode("utf-8")


def call_api(method: str, path: str, query_params: dict = None,
             body: bytes = None, extra_headers: dict = None) -> dict:
    ts = str(int(time.time() * 1000))
    nc = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    sig = make_x_api_signature(method, path, query_params, CLIENT_SECRET, ts, nc)

    headers = {
        "Content-Type": "application/json",
        "X-Api-ClientID": CLIENT_ID,
        "X-Api-Auth-Version": "2.0",
        "X-Api-TimeStamp": ts,
        "X-Api-Nonce": nc,
        "X-Api-SignHeaders": "X-Api-Nonce,X-Api-TimeStamp",
        "X-Api-Signature": sig,
    }
    if extra_headers:
        headers.update(extra_headers)

    url = f"{BASE_URL}{path}"
    if query_params:
        url += "?" + "&".join([
            f"{urllib.parse.quote(str(k), safe='')}={urllib.parse.quote(str(v), safe='')}"
            for k, v in sorted(query_params.items())
        ])

    resp = (requests.post(url, headers=headers, data=body, timeout=20)
            if method == "POST"
            else requests.get(url, headers=headers, timeout=20))
    try:
        return resp.json()
    except Exception:
        return {"raw": resp.text, "status_code": resp.status_code}


# ==================== 核心业务函数 ====================

def get_app_key_secret() -> tuple:
    """Step1: 获取最新 app_key, app_secret, domain（app_secret 每次可能不同，必须动态获取）"""
    result = call_api("POST", "/jdyconnector/app_management/push_app_authorize", body=b"{}")
    if result.get("errcode") != 0:
        raise Exception(f"获取 app_key 失败: {result}")
    data_list = result.get("data", [])
    if not isinstance(data_list, list) or not data_list:
        raise Exception(f"data 为空: {result}")
    item = data_list[0]
    return item["appKey"], item["appSecret"], item.get("domain", "https://tf.jdy.com")


def get_app_token(app_key: str, app_secret: str) -> str:
    """Step2: 用 app_key + app_secret 换取 app-token（有效期 24 小时）"""
    app_sig = make_app_signature(app_key, app_secret)
    result = call_api("GET", "/jdyconnector/app_management/kingdee_auth_token",
                      query_params={"app_key": app_key, "app_signature": app_sig})
    if result.get("errcode") != 0:
        raise Exception(f"获取 token 失败: {result.get('description')}")
    return result["data"]["app-token"]


def get_material_list(app_token: str, domain: str,
                      page: int = 1, page_size: int = 10,
                      enable: str = "-1", search: str = None) -> dict:
    """Step3: 获取商品列表"""
    params = {"page": str(page), "page_size": str(page_size), "enable": enable}
    if search:
        params["search"] = search
    return call_api("GET", "/jdy/v2/bd/material",
                    query_params=params,
                    extra_headers={"app-token": app_token, "X-GW-Router-Addr": domain})


# ==================== 主程序示例 ====================

if __name__ == "__main__":
    # Step1: 获取 app_key/app_secret
    app_key, app_secret, domain = get_app_key_secret()
    print(f"✅ app_key={app_key}, domain={domain}")

    # Step2: 获取 app-token
    app_token = get_app_token(app_key, app_secret)
    print(f"✅ app-token 获取成功")

    # Step3: 获取商品列表（全部状态，第1页，10条）
    result = get_material_list(app_token, domain, page=1, page_size=10, enable="-1")

    if result.get("errcode") == 0:
        data = result["data"]
        print(f"✅ 共 {data.get('count')} 条商品，本次返回 {len(data.get('rows', []))} 条")
        for item in data.get("rows", []):
            print(f"  [{item.get('number')}] {item.get('name')} - {item.get('base_unit_name')}")
    else:
        print(f"❌ 失败: {result}")
```

---

## 六、注意事项汇总

### 常见错误和解决方法

| 错误现象 | 原因 | 解决方法 |
|---------|------|---------|
| `errcode: 400` 签名验证失败 | 签名原文格式错误 | 检查路径是否 `%2F` 编码，value 是否双重编码 |
| `errcode: 400` 签名验证失败 | Base64 编码对象错误 | 必须对 hex 字符串做 Base64，不能对原始字节做 |
| `errcode: 400` 签名验证失败 | SignHeaders 顺序错误 | 必须是 `X-Api-Nonce,X-Api-TimeStamp`（Nonce 在前） |
| token 获取成功但业务接口 401 | app_secret 缓存过期轮换 | 每次都重新调用 Step1 获取最新 app_secret |
| `errcode: 401` token 无效 | app-token 超过 24 小时 | 重新执行 Step1+Step2 获取新 token |
| 时间戳失效 | 本机时间与服务器偏差超 5 分钟 | 使用 NTP 同步系统时间 |

### 生产环境建议

1. **token 缓存策略**：app-token 有效期 24 小时，建议缓存并在到期前 10 分钟主动刷新。
2. **app_secret 不要缓存**：每次获取 token 前都应重新调用 `push_app_authorize` 拿最新的 app_secret。
3. **错误重试**：遇到 `errcode != 0` 时，建议等待 1-2 秒后重试（最多3次）。
4. **分页拉取**：商品总量 1147 条，建议 `page_size=100` 分 12 页拉取完整数据。

---

## 七、扩展其他业务接口

基础封装已完成，新增其他接口只需参考 Step3 的模式，在 `call_api` 基础上封装即可。所有业务接口的通用规则：

- **请求头**：通用签名头 + `app-token` + `X-GW-Router-Addr`
- **签名**：每次请求重新生成（时间戳 + 随机 nonce）
- **域名前缀**：`https://api.kingdee.com` + 接口路径

---

*文档版本：v1.0 | 最后验证时间：2026-06-06 | 验证环境：东莞市特澳电子科技有限公司 金蝶云星辰*
