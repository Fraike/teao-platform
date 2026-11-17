import { normalizeAssemblyLine } from "../shared/assembly-lines.ts";
import { validDate } from "./assembly-scheduling-rules.ts";
import type { ScheduleSettings, ScheduleOverride } from "../../src/types/assemblyScheduling.ts";

export const defaultScheduleSettings: ScheduleSettings = {
  prepDays:0,draftTime:"16:00",shipmentField:"",reconciliation:"",warehouseIds:[],capacities:[],overrides:{},
};

export function scheduleError(message: string, status = 400): never {
  throw Object.assign(new Error(message),{status});
}

function range(n: unknown, min: number, max: number, integer = false) {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
}

export function validateScheduleSettings(config: ScheduleSettings) {
  if (!config || !range(config.prepDays,0,30,true) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(config.draftTime)
    || !["","out_qty","real_out_qty"].includes(config.shipmentField) || (typeof config.reconciliation !== "string" || config.reconciliation.length > 500)
    || !Array.isArray(config.warehouseIds) || config.warehouseIds.some(id => typeof id !== "string" || !id)
    || !Array.isArray(config.capacities)) scheduleError("排单设置格式无效");
  const hours = new Map<string,number>();
  const pairs = new Set<string>();
  for (const c of config.capacities) {
    if (!c || normalizeAssemblyLine(c.line) !== c.line || typeof c.materialId !== "string" || !c.materialId
      || !range(c.hours,0,24) || !range(c.shiftHours,0.01,24) || !range(c.output,1,1e8,true)
      || !range(c.changeHours,0,24)) scheduleError("产能配置无效");
    if (hours.has(c.line) && hours.get(c.line) !== c.hours) scheduleError("同一产线的当天可用工时必须一致");
    hours.set(c.line,c.hours);
    const key = JSON.stringify([c.line,c.materialId]);
    if (pairs.has(key)) scheduleError("同一产线产品不得重复配置");
    pairs.add(key);
  }
}

export function validateOverride(value: ScheduleOverride) {
  if (!value || typeof value !== "object" || Array.isArray(value)) scheduleError("需求调整格式无效");
  if (value.line !== undefined && normalizeAssemblyLine(value.line) !== value.line) scheduleError("产线无效");
  if (value.maxQty !== undefined && !range(value.maxQty,0,1e8,true)) scheduleError("装配上限无效");
  if (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 500)) scheduleError("备注最多 500 字");
  if ([value.ready,value.urgent].some(v => v !== undefined && typeof v !== "boolean")) scheduleError("需求状态无效");
  if (value.batches !== undefined && (!Array.isArray(value.batches) || value.batches.some(b => !b || !validDate(b.date) || !range(b.qty,1,1e8,true) || (b.note !== undefined && (typeof b.note !== "string" || b.note.length > 500)))
    || new Set(value.batches.map(b => b.date)).size !== value.batches.length)) scheduleError("分批日期或数量无效，日期不得重复");
  if (value.actualReportIds !== undefined && (!Array.isArray(value.actualReportIds) || value.actualReportIds.some(id => !range(id,1,Number.MAX_SAFE_INTEGER,true)))) scheduleError("日报关联无效");
  if (value.expected !== undefined && (!Array.isArray(value.expected) || value.expected.some(e => !e || !range(e.reportId,1,Number.MAX_SAFE_INTEGER,true)
    || !validDate(e.date) || !range(e.qty,1,1e8,true)))) scheduleError("预计可交付记录无效");
}
