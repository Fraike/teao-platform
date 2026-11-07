import { pushAllowed, readPushSettings } from './push-settings.ts';
import type { PushChannel } from '../../src/types/pushSettings.ts';

export function pushDisabledError() {
  return Object.assign(new Error('推送已在系统设置中关闭，未发送消息'), { code: 'PUSH_DISABLED', status: 409 });
}
export function capturePushGuard(channel: PushChannel): () => boolean {
  if (!pushAllowed(channel)) throw pushDisabledError();
  const initial = readPushSettings();
  return () => {
    const current = readPushSettings();
    return pushAllowed(channel) && current.revision === initial.revision
      && (channel !== 'production' || current.productionRevision === initial.productionRevision);
  };
}
