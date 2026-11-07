import { capturePushGuard, pushDisabledError } from './push-policy.ts';
import type {
  WecomAppConfig, WecomAppDependencies, WecomAppErrorCode, WecomAppNotificationStatus,
  WecomAppSendOptions, WecomApiBody, WecomTokenCache, WecomTokenRequest,
} from '../../src/types/wecom.ts';
import { createWecomRateLimiter } from './wecom-rate-limit.js';
const fail = (code: WecomAppErrorCode) => Object.assign(new Error('企业微信应用通知未送达，请联系管理员核查'), { code, status: 502 });
export function readWecomAppConfig(): WecomAppConfig {
  return { corpId: process.env.WECOM_CORP_ID || '', agentId: process.env.WECOM_AGENT_ID || '', secret: process.env.WECOM_APP_SECRET || '' };
}
export function isWecomAppConfigured(config = readWecomAppConfig()) {
  return Boolean(config.corpId && /^\d+$/.test(String(config.agentId)) && config.secret);
}
export function appNotificationStatus(error: unknown): WecomAppNotificationStatus {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const statuses: Record<string, WecomAppNotificationStatus> = { APP_NOT_CONFIGURED: 'not_configured', RECIPIENT_UNBOUND: 'unbound', SEND_CANCELLED: 'cancelled', SEND_RESULT_UNCERTAIN: 'unknown' };
  if (code === 'PUSH_DISABLED') return 'disabled';
  return statuses[code] || 'failed';
}
export function createWecomAppClient({ config = readWecomAppConfig, fetch: request = (...args) => fetch(...args), now = Date.now, reserve = createWecomRateLimiter() } : WecomAppDependencies = {}) {
  let cached: WecomTokenCache | undefined;
  let pending: WecomTokenRequest | undefined;
  async function token(settings: WecomAppConfig) {
    const key = JSON.stringify(settings);
    if (cached?.key === key && cached.until > now()) return cached.value;
    if (pending?.key === key) return pending.promise;
    const promise = (async () => {
      try {
        const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
        url.searchParams.set('corpid', settings.corpId); url.searchParams.set('corpsecret', settings.secret);
        const response = await request(url.toString(), { signal: AbortSignal.timeout(15000) });
        const body = await response.json();
        if (!response.ok || body.errcode !== 0 || !body.access_token || !(body.expires_in !== undefined && body.expires_in > 0)) throw fail('TOKEN_FAILED');
        cached = { key, value: body.access_token, until: now() + Math.max(0, body.expires_in! - 120) * 1000 };
        return cached.value;
      } catch { throw fail('TOKEN_FAILED'); }
    })();
    pending = { key, promise };
    try { return await promise; } finally { if (pending?.promise === promise) pending = undefined; }
  }
  return { async send(userid: string, content: string, { shouldSend }: WecomAppSendOptions = {}) {
    if (!userid || /[|@\s]/.test(userid)) throw fail('RECIPIENT_UNBOUND');
    const settings = config();
    if (!isWecomAppConfigured(settings)) throw fail('APP_NOT_CONFIGURED');
    for (let attempt = 0; attempt < 2; attempt++) {
      const accessToken = await token(settings);
      await reserve(`${settings.corpId}:${settings.agentId}`);
      if (JSON.stringify(config()) !== JSON.stringify(settings) || (shouldSend && !shouldSend())) throw fail('SEND_CANCELLED');
      let body: WecomApiBody;
      try {
        const response = await request(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ touser: userid, agentid: Number(settings.agentId), msgtype: 'text', text: { content } }),
        });
        body = await response.json();
        if (!response.ok || !Number.isInteger(body.errcode)) throw fail('SEND_RESULT_UNCERTAIN');
      } catch { throw fail('SEND_RESULT_UNCERTAIN'); }
      if ([40014, 42001].includes(body.errcode) && attempt === 0) { if(cached?.value===accessToken) cached=undefined; continue; }
      if (body.errcode !== 0 || body.invaliduser || body.unlicenseduser) throw fail('SEND_REJECTED');
      return { status: 'sent' };
    }
  } };
}
const client = createWecomAppClient();
export const sendWecomAppText = (userid: string, content: string, options?: WecomAppSendOptions) => {
  const allowed = capturePushGuard('standardReview');
  return client.send(userid, content, { shouldSend: () => {
    if (!allowed()) throw pushDisabledError();
    return !options?.shouldSend || options.shouldSend();
  } });
};
