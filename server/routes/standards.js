import { canDirectRetire, retirementReviewers, createRetirementRequest, listRetirementRequests, reviewRetirementRequest } from "../services/standard-retirement.js";
import { createHash } from "node:crypto";
import { jwtAuth, requirePermission } from "../middleware/jwt-auth.js";
import { getUserById, listUsers } from "../services/users.js";
import { notifyReviewRequested, notifyReviewDone, notifyRetirementRequested } from "../services/standard-notify.js";
import { createStandardReviewReminders } from "../services/standard-review-reminders.js";
import { publicationDelivery, retryStandardPublication, publicationResponse } from "../services/standard-publication-outbox.js";
import { readConfig } from "../config.js";
import { listPendingReviews } from "../services/standard-pending-reviews.js";
import {
  initDB,
  getDB,
  listCategories,
  listStandardPage,
  getStandardQueryVersion,
  getStandard,
  getStandardHistory,
  createStandard,
  updateStandard,
  submitStandard,
  reviewStandard,
  retireStandard,
  discardPendingStandard,
  withdrawStandard,
  discardDraftStandard,
  previewStandardImport,
  confirmStandardImport,
} from "../services/standard-store.js";

initDB();

function canEdit(user) {
  return user?.role === "admin" || user?.permissions?.includes("engineering_submit");
}

function canReview(user) {
  return user?.role === "admin" || user?.permissions?.includes("engineering_review");
}

function actorName(req) {
  const user = getUserById(req.user.id);
  return { id: user.id, name: user.name || user.username, role: user.role };
}

function viewerVersion(user) {
  return createHash("sha256").update(JSON.stringify([getStandardQueryVersion(), user.id, user.role, [...(user.permissions || [])].sort()])).digest("hex");
}

// 标准操作按最新用户权限校验，撤权立即生效。
function currentUser(req, res, next) {
  const user = getUserById(req.user.id);
  if (!user || user.status !== "active") return res.status(401).json({ error: "登录状态已失效" });
  req.user = user;
  next();
}

function requireAdminImport(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员可初始化导入已发布标准" });
  next();
}

export function registerStandardRoutes(app) {
  const reviewReminders = createStandardReviewReminders();
  // 分类字段模板
  app.get("/api/standards/categories", jwtAuth, currentUser, (_req, res) => {
    try {
      res.json({ ok: true, data: listCategories() });
    } catch (err) {
      console.error("[standards] categories error:", err);
      res.status(500).json({ error: "查询分类失败", detail: err.message });
    }
  });

  app.get('/api/standards/pending-reviews', jwtAuth, currentUser, (req, res) => {
    try {
      const result = listPendingReviews(req.user, req.query);
      res.locals.responseRows = result.data.length;
      res.json({ ok: true, ...result, version: viewerVersion(req.user) });
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : '待审概览加载失败' }); }
  });

  // 列表
  app.get("/api/standards", jwtAuth, currentUser, (req, res) => {
    try {
      const { category, status, standardType, search } = req.query;
      if (status === "deleted" && req.user.role !== "admin") return res.status(403).json({ error: "仅管理员可查看删除归档" });
      if (req.query.all === "true" && (typeof category !== "string" || !category.trim())) {
        return res.status(400).json({ error: "全量查询必须指定分类" });
      }
      const onlyPublished = !canEdit(req.user) && !canReview(req.user);
      const result = listStandardPage({
        category: category || undefined,
        status: status || undefined,
        standardType: standardType || undefined,
        search: search || undefined,
        onlyPublished,
        reviewerId: onlyPublished ? req.user.id : undefined,
        includeObsolete: req.query.includeObsolete === "true",
        excludeObsolete: req.query.excludeObsolete === "true",
        customer: req.query.customer, model: req.query.model, customerPartNo: req.query.customerPartNo,
        vehicleModel: req.query.vehicleModel, page: req.query.page, pageSize: req.query.all === "true" ? null : req.query.pageSize,
      });
      res.locals.responseRows = result.data.length;
      res.json({ ok: true, ...result, version: viewerVersion(req.user), canEdit: canEdit(req.user), canReview: canReview(req.user), canImport: req.user.role === "admin", canRetire: canDirectRetire(req.user) });
    } catch (err) {
      console.error("[standards] list error:", err);
      res.status(err.status || 500).json({ error: "查询失败", detail: err.message });
    }
  });

  app.get("/api/standards/version", jwtAuth, currentUser, (req, res) => {
    res.json({ ok: true, version: viewerVersion(req.user) });
  });

  app.get("/api/standards/reviewers", jwtAuth, currentUser, (req,res) => {
    res.json({ok:true,data:listUsers().filter(user=>user.status==="active" && user.id!==req.user.id).map(user=>({id:user.id,name:user.name||user.username}))});
  });

  app.get("/api/standards/retirement-reviewers", jwtAuth, currentUser, (req,res) => res.json({ok:true,data:retirementReviewers(req.user)}));

  // 详情（含版本历史）
  app.get("/api/standards/:id", jwtAuth, currentUser, (req, res) => {
    try {
      const standard = getStandard(req.params.id, { onlyPublished: !canEdit(req.user) && !canReview(req.user), reviewerId:req.user.id, includeHistory: req.query.summary !== "true", includeCurrentComments: req.query.comments === "current", includeDeleted: req.user.role === "admin" && req.query.includeDeleted === "true" });
      if (!standard) return res.status(404).json({ error: "标准不存在" });
      res.json({ ok: true, data: standard, ...(req.query.comments === "current" ? { currentCommentsIncluded: true } : {}) });
    } catch (err) {
      console.error("[standards] detail error:", err);
      res.status(500).json({ error: "查询失败", detail: err.message });
    }
  });

  app.get("/api/standards/:id/history", jwtAuth, currentUser, (req, res) => {
    try {
      const result = getStandardHistory(req.params.id, { onlyPublished: !canEdit(req.user) && !canReview(req.user),
        reviewerId:req.user.id, includeDeleted: req.user.role === "admin", section: req.query.section, page: req.query.page, pageSize: req.query.pageSize, fieldKey:req.query.fieldKey });
      if (!result) return res.status(404).json({ error: "标准不存在" });
      res.locals.responseRows = result.data.length;
      res.json({ ok: true, ...result });
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });

  // 新建草稿
  app.post("/api/standards", jwtAuth, currentUser, requirePermission("engineering_submit"), async (req, res) => {
    try {
      const data = createStandard(req.body, actorName(req));
      const notification = req.user.role === "admin" ? await notifyReviewDone(data, { approve: true, directPublish: true, reviewerName: actorName(req).name }).catch(() => ({ status: "unknown", sentParts: 0, totalParts: 0 })) : undefined;
      res.status(201).json({ ok: true, data, notification });
    } catch (err) {
      console.error("[standards] create error:", err);
      res.status(err.status || 500).json({ error: err.message || "新增失败" });
    }
  });

  // 编辑（生成草稿版本）
  app.put("/api/standards/:id", jwtAuth, currentUser, requirePermission("engineering_submit"), async (req, res) => {
    try {
      const data = updateStandard(req.params.id, req.body, actorName(req));
      const notification = req.user.role === "admin" ? await notifyReviewDone(data, { approve: true, directPublish: true, reviewerName: actorName(req).name }).catch(() => ({ status: "unknown", sentParts: 0, totalParts: 0 })) : undefined;
      res.json({ ok: true, data, notification });
    } catch (err) {
      console.error("[standards] update error:", err);
      res.status(err.status || 500).json({ error: err.message || "更新失败" });
    }
  });

  // 提交审核
  app.post("/api/standards/:id/submit", jwtAuth, currentUser, requirePermission("engineering_submit"), (req, res) => {
    try {
      const reviewer = getUserById(req.body?.reviewerId);
      if (!reviewer || reviewer.status!=="active" || reviewer.id===req.user.id) return res.status(400).json({error:"请选择已激活且非自己的审核人"});
      const data = submitStandard(req.params.id, actorName(req), {...req.body,reviewerId:reviewer.id,reviewerName:reviewer.name||reviewer.username});
      void notifyReviewRequested(data, actorName(req));
      res.json({ ok: true, data });
    } catch (err) {
      console.error("[standards] submit error:", err);
      res.status(err.status || 500).json({ error: err.message || "提交失败" });
    }
  });

  app.get("/api/standards/:id/publication", jwtAuth, currentUser, (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员可查看公告送达记录" });
    const detail = getStandard(req.params.id, { includeHistory: false });
    const version = detail?.versions.find(item => item.status === "published");
    if (!version) return res.status(404).json({ error: "没有当前已发布版本" });
    res.json({ ok: true, data: publicationDelivery(getDB(), detail.id, version.id) });
  });

  app.post("/api/standards/:id/publication/retry", jwtAuth, currentUser, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员可补发公告" });
    try {
      const detail = getStandard(req.params.id, { includeHistory: false });
      const version = detail?.versions.find(item => item.status === "published");
      if (!version || version.id !== req.body?.versionId) return res.status(409).json({ error: "当前已发布版本已变化，请刷新" });
      const id = retryStandardPublication(getDB(), detail.id, version.id, req.body?.revision, req.body?.acknowledgeUncertain, req.user);
      const data = await publicationResponse(getDB(), id, { webhook: readConfig().wecomWebhook });
      res.json({ ok: true, data });
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : "补发结果不确定，请先核查群记录" }); }
  });

  app.post("/api/standards/:id/remind", jwtAuth, currentUser, async (req, res) => {
    try {
      const result = await reviewReminders.remind(req.params.id, req.user, req.body);
      if (result.status === "cooldown") return res.status(429).json({ error: "该标准最近已提醒，请稍后再催", code: "REMINDER_COOLDOWN", retryAt: result.retryAt });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.status ? error.message : "催促审核失败，请稍后重试" });
    }
  });

  // 审核（通过/驳回）
  app.post("/api/standards/:id/review", jwtAuth, currentUser, (req, res, next) => {
    const pending=getStandard(req.params.id,{includeHistory:false})?.versions.find(version=>version.status==="pending_review");
    const adminReject = req.user.role === "admin" && req.body?.approve === false;
    if (!adminReject && (pending?.assignedReviewerId ? pending.assignedReviewerId!==req.user.id : !canReview(req.user))) return res.status(403).json({ error: "不是指定审核人" });
    next();
  }, async (req, res) => {
    try {
      const { approve, comment, versionId, revision } = req.body || {};
      const data = reviewStandard(req.params.id, { approve, comment, versionId, revision }, actorName(req));
      const notification = await notifyReviewDone(data, { approve, comment: comment || "", reviewerName: actorName(req).name })
        .catch(() => ({ status: "failed", sentParts: 0, totalParts: 0 }));
      res.json({ ok: true, data, notification });
    } catch (err) {
      console.error("[standards] review error:", err);
      res.status(err.status || 500).json({ error: err.message || "审核失败" });
    }
  });

  for (const [action, perform] of [["withdraw", withdrawStandard], ["discard-draft", discardDraftStandard]]) {
    app.post(`/api/standards/:id/${action}`, jwtAuth, currentUser, (req, res) => {
      try { res.json({ ok: true, data: perform(req.params.id, req.body, actorName(req)) }); }
      catch (error) { res.status(error.status || 500).json({ error: error.message }); }
    });
  }

  app.post("/api/standards/:id/discard", jwtAuth, currentUser, (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员可以删除待审内容" });
    try { res.json({ ok: true, data: discardPendingStandard(req.params.id, req.body, actorName(req)) }); }
    catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });

  app.get("/api/standards/:id/retirement-requests", jwtAuth, currentUser, (req,res) => {
    if (!getStandard(req.params.id,{onlyPublished:!canEdit(req.user)&&!canReview(req.user)})) return res.status(404).json({error:"标准不存在"});
    res.json({ok:true,data:listRetirementRequests(req.params.id)});
  });
  app.post("/api/standards/:id/retirement-requests", jwtAuth, currentUser, async (req,res) => {
    try {
      const request=createRetirementRequest(req.params.id,req.body,req.user);
      const notification=await notifyRetirementRequested(getStandard(req.params.id),request).catch(()=>({status:"unknown"}));
      res.status(201).json({ok:true,data:getStandard(req.params.id),request,notification});
    } catch(error) {res.status(error.status||500).json({error:error.message});}
  });
  app.post("/api/standards/:id/retirement-requests/:requestId/review", jwtAuth, currentUser, (req,res) => {
    try {res.json({ok:true,...reviewRetirementRequest(req.params.id,req.params.requestId,req.body,req.user)});}
    catch(error) {res.status(error.status||500).json({error:error.message});}
  });
  app.post("/api/standards/:id/retire", jwtAuth, currentUser, (req, res) => {
    if (!canDirectRetire(req.user)) return res.status(403).json({error:"无直接停用权限"});
    try { res.json({ok:true,data:retireStandard(req.params.id,req.body,actorName(req))}); }
    catch(error) { res.status(error.status || 500).json({error:error.message}); }
  });

  // 导入预览
  app.post("/api/standards/import/preview", jwtAuth, currentUser, requireAdminImport, (req, res) => {
    try {
      res.json({ ok: true, data: previewStandardImport(req.body?.records, actorName(req)) });
    } catch (err) {
      console.error("[standards] import preview error:", err);
      res.status(err.status || 500).json({ error: err.message || "预览失败" });
    }
  });

  // 导入确认
  app.post("/api/standards/import/confirm", jwtAuth, currentUser, requireAdminImport, async (req, res) => {
    try {
      const actor = actorName(req);
      const result = await confirmStandardImport(req.body?.records, actor, req.body?.token, () => {
        const user = getUserById(actor.id);
        if (!user || user.status !== "active" || user.role !== "admin") {
          const error = new Error("管理员权限已失效，导入未执行");
          error.status = 403;
          throw error;
        }
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[standards] import confirm error:", err);
      res.status(err.status || 500).json({ error: err.message || "导入失败" });
    }
  });
}
