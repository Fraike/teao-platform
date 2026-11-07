import { jwtAuth, adminAuth } from '../middleware/jwt-auth.js';
import { readPushSettings, writePushSettings } from '../services/push-settings.ts';

export function registerSystemSettingsRoutes(app) {
  const handle = (handler) => (req, res) => {
    try { res.json({ ok: true, data: handler(req) }); }
    catch (error) {
      res.status(error.status || 500).json({ error: error.status ? error.message : '推送配置保存或读取失败，请稍后重试' });
    }
  };
  app.get('/api/admin/system-settings/push', jwtAuth, adminAuth, handle(() => readPushSettings()));
  app.put('/api/admin/system-settings/push', jwtAuth, adminAuth, handle(req => writePushSettings(req.body, req.user)));
}
