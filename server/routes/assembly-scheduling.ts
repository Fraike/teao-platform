import type { Express, Request, Response } from "express";
import { jwtAuth, requirePermission, adminAuth } from "../middleware/jwt-auth.js";
import { scheduleStatus, startScheduleSync, startStockSync, scheduleLedger, schedulePreview, publishedSchedule, publishSchedule,
  saveScheduleSettings, saveScheduleOverride, saveDailyInstructionRow, scheduledDraft, scheduleProducts } from "../services/assembly-scheduling.ts";

type UserRequest = Request & {user?: {id?: string; role?: string; permissions?: string[]}};
const root = "/api/assembly-scheduling";
const production = requirePermission("production");
const planner = requirePermission("production_schedule");
const actor = (req: UserRequest) => String(req.user?.id ?? "unknown");
const canEdit = (req: UserRequest) => req.user?.role === "admin" || !!req.user?.permissions?.includes("production_schedule");
const handle = (fn: (req: UserRequest, res: Response) => unknown) => (req: UserRequest,res: Response) => {
  try { res.json(fn(req,res)); }
  catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
    res.status(status).json({error:status < 500 && error instanceof Error ? error.message : "装配排单处理失败"});
  }
};

export function registerAssemblySchedulingRoutes(app: Express) {
  app.get(root,jwtAuth,production,handle(req => {
    const access = {canEdit:canEdit(req),canConfigure:req.user?.role === "admin"};
    const status = scheduleStatus();
    if (access.canEdit) return {...status,...access};
    return {canEdit:false,canConfigure:false,lines:status.lines};
  }));
  app.get(root+"/published",jwtAuth,production,handle(req => publishedSchedule(String(req.query.date ?? ""))));
  app.get(root+"/ledger",jwtAuth,production,planner,handle(req =>
    scheduleLedger(String(req.query.kind),String(req.query.q ?? ""),Math.max(1,Math.floor(Number(req.query.page) || 1)),
      {warehouse:String(req.query.warehouse ?? ""),category:String(req.query.category ?? ""),status:String(req.query.status ?? ""),closed:String(req.query.closed ?? "")})));
  app.get(root+"/products",jwtAuth,adminAuth,handle(()=>scheduleProducts()));
  app.get(root+"/preview",jwtAuth,production,planner,handle(req => schedulePreview(String(req.query.date ?? ""))));
  app.get(root+"/scheduled",jwtAuth,production,planner,handle(req => scheduledDraft(String(req.query.date ?? ""))));
  app.post(root+"/sync-stock",jwtAuth,production,planner,handle(req => ({started:!!startStockSync(actor(req))})));
  app.post(root+"/sync",jwtAuth,production,planner,handle(req => ({started:startScheduleSync(actor(req))})));
  app.put(root+"/settings",jwtAuth,adminAuth,handle(req => {
    saveScheduleSettings(req.body?.settings ?? {},req.body?.revision,actor(req)); return {ok:true};
  }));
  app.put(root+"/daily-row",jwtAuth,production,planner,handle(req => {
    saveDailyInstructionRow(req.body ?? {},actor(req)); return {ok:true};
  }));
  app.put(root+"/override",jwtAuth,production,planner,handle(req => {
    saveScheduleOverride(req.body?.id,req.body?.value,req.body?.revision,actor(req)); return {ok:true};
  }));
  app.post(root+"/publish",jwtAuth,production,planner,handle(req =>
    publishSchedule(req.body?.date,req.body?.token,req.body?.reason,actor(req),req.body?.checked === true)));
}
