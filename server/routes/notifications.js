import { jwtAuth } from "../middleware/jwt-auth.js";
import { getUserById } from "../services/users.js";
import { listNotificationsPage } from "../services/notifications.js";

export function registerNotificationRoutes(app) {
  app.get("/api/notifications", jwtAuth, (req, res) => {
    try {
      const user = getUserById(req.user.id);
      const { data, total } = listNotificationsPage(user);
      const body = { ok: true, data, total };
      res.locals.responseRows = data.length;
      res.locals.responseBytes = Buffer.byteLength(JSON.stringify(body));
      res.json(body);
    } catch (err) {
      console.error("[notifications] error:", err);
      res.status(500).json({ error: "获取通知失败", detail: err.message });
    }
  });
}
