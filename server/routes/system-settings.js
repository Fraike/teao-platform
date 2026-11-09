import { listStandardMaintainers, setStandardMaintainers } from '../services/users.js';
import { jwtAuth, adminAuth } from '../middleware/jwt-auth.js';
import { readStandardMaintenance, writeStandardMaintenance } from '../services/standard-maintenance.ts';
import { readPushSettings, writePushSettings } from '../services/push-settings.ts';

export function registerSystemSettingsRoutes(app) {
  const handle = (handler) => (req, res) => {
    try { res.json({ ok: true, data: handler(req) }); }
    catch (error) {
      res.status(error.status || 500).json({ error: error.status ? error.message : '系统设置保存或读取失败，请稍后重试' });
    }
  };
  app.get('/api/admin/system-settings/standard-maintenance', jwtAuth, adminAuth, handle(() => readStandardMaintenance()));
  app.put('/api/admin/system-settings/standard-maintenance', jwtAuth, adminAuth, handle(req => {
    if (req.body?.enabled === true && req.body.rosterRevision !== listStandardMaintainers().revision) {
      throw Object.assign(new Error('校对人员名单已变化，请刷新确认后再开启'), { status: 409 });
    }
    return writeStandardMaintenance(req.body, req.user);
  }));
  app.get('/api/admin/system-settings/standard-maintainers', jwtAuth, adminAuth, handle(() => listStandardMaintainers()));
  app.put('/api/admin/system-settings/standard-maintainers', jwtAuth, adminAuth, async (req, res) => {
    try { res.json({ ok: true, data: await setStandardMaintainers(req.body, req.user.id) }); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : '校对人员保存失败' }); }
  });
  app.get('/api/admin/system-settings/push', jwtAuth, adminAuth, handle(() => readPushSettings()));
  app.put('/api/admin/system-settings/push', jwtAuth, adminAuth, handle(req => writePushSettings(req.body, req.user)));
}
