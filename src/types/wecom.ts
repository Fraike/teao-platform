export interface WecomAppConfig {
  corpId: string;
  agentId: string;
  secret: string;
}

export interface WecomAppSendOptions {
  shouldSend?: () => boolean;
}

export interface WecomApiBody {
  errcode: number;
  access_token?: string;
  expires_in?: number;
  invaliduser?: string;
  unlicenseduser?: string;
}

export interface WecomAppRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  body?: string;
}

export interface WecomAppResponse {
  ok: boolean;
  json: () => Promise<WecomApiBody>;
}

export interface WecomAppDependencies {
  config?: () => WecomAppConfig;
  fetch?: (url: string, options?: WecomAppRequestOptions) => Promise<WecomAppResponse>;
  now?: () => number;
  reserve?: (key: string) => Promise<void>;
}

export interface WecomTokenCache {
  key: string;
  value: string;
  until: number;
}

export interface WecomTokenRequest {
  key: string;
  promise: Promise<string>;
}

export type WecomAppErrorCode = 'APP_NOT_CONFIGURED' | 'RECIPIENT_UNBOUND' | 'SEND_CANCELLED'
  | 'SEND_RESULT_UNCERTAIN' | 'TOKEN_FAILED' | 'SEND_REJECTED';

export type WecomAppNotificationStatus = 'not_configured' | 'unbound' | 'cancelled' | 'unknown' | 'failed';
