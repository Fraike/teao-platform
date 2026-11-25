import { canAccessEngineeringChanges } from '../shared/engineering-change-content.ts';
import { appNotificationStatus, sendWecomAppText } from './wecom-app.ts';
import { changeLink, createEngineeringChangeStore } from './engineering-changes.ts';
import type { LookupUser } from './engineering-change-actions.ts';

type Store = ReturnType<typeof createEngineeringChangeStore>;

export function createChangeNotificationWorker(store: Store, lookup: LookupUser, send = sendWecomAppText) {
  let running = false;
  async function drain() {
    if (running) return;
    running = true;
    try {
      store.recoverMessages();
      for (let index = 0; index < 50; index++) {
        const message = store.claimMessage();
        if (!message) break;
        const stillCurrent = () => store.messageCurrent(message);
        const person = lookup(message.userId);
        const binding = person?.wecomUserid;
        const origin = store.config()?.origin;
        let status = 'sent';
        if (!stillCurrent()) status = 'cancelled';
        else if (person?.status !== 'active') status = 'inactive';
        else if (!canAccessEngineeringChanges(person)) status = 'permission_missing';
        else if (!binding) status = 'unbound';
        else if (!origin) status = 'link_unconfigured';
        else {
          try {
            await send(binding, `${message.content}\n处理入口：${new URL(changeLink(message.changeId), origin)}`, {
              shouldSend: () => {
                const latest = lookup(message.userId);
                return stillCurrent() && latest?.status === 'active' && canAccessEngineeringChanges(latest) && latest.wecomUserid === binding && store.config()?.origin === origin;
              },
            }, 'engineeringChange');
          } catch (error) { status = appNotificationStatus(error); }
        }
        store.finishMessage(message.key, status);
      }
    } finally { running = false; }
  }
  function wake() {
    void drain().catch(() => console.error('[engineering-change] 企微通知队列处理失败'));
  }
  return { wake, drain };
}
