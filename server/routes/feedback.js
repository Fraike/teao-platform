import { jwtAuth } from "../middleware/jwt-auth.js";
import { getUserById } from "../services/users.js";
import { createFeedback, listFeedback, getFeedback, updateFeedback } from "../services/feedback-store.js";

function currentUser(req, res, next) {
  const user = getUserById(req.user.id);
  if (!user || user.status !== "active") return res.status(401).json({ error: "登录状态已失效" });
  req.user = user; next();
}

function action(handler, status = 200) {
  return (req, res) => {
    try { res.status(status).json({ ok: true, ...handler(req) }); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : "反馈操作失败，请稍后重试" }); }
  };
}

export function registerFeedbackRoutes(app) {
  app.get("/api/feedback", jwtAuth, currentUser, action(req => listFeedback(req.query, req.user)));
  app.post("/api/feedback", jwtAuth, currentUser, action(req => ({ data: createFeedback(req.body, req.user) }), 201));
  app.get("/api/feedback/:id", jwtAuth, currentUser, action(req => ({ data: getFeedback(req.params.id, req.user) })));
  app.put("/api/feedback/:id", jwtAuth, currentUser, action(req => ({ data: updateFeedback(req.params.id, req.body, req.user) })));
}
