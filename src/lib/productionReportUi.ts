import { ApiError } from "./api.ts";
import type {
  ProductionDataSource, ProductionReportChannel, ProductionReportCoordinator,
  ProductionReportTicket, ProductionSourceSwitchAction,
} from "../types/productionReport.ts";

export function productionSourceLabel(source: ProductionDataSource | null): string {
  return source === "vika" ? "维格表" : source === "internal" ? "内部平台" : "获取失败";
}

export function getSourceSwitchAction(role: string | undefined, source: ProductionDataSource | null): ProductionSourceSwitchAction | null {
  if (role !== "admin" || source === null) return null;
  return source === "vika"
    ? { label: "切换到内部平台", target: "internal" }
    : { label: "切回维格表", target: "vika" };
}

export function formatReportRate(rate: number | null | undefined, digits = 1): string {
  return rate == null ? "—" : `${(rate * 100).toFixed(digits)}%`;
}

export function requiresRepeatConfirmation(error: unknown): boolean {
  return error instanceof ApiError && error.code === "REPEAT_CONFIRMATION_REQUIRED";
}

export function createProductionReportCoordinator(date: string, source: ProductionDataSource | null): ProductionReportCoordinator {
  let context = { date, source };
  let revision = 0;
  const sequences: Partial<Record<ProductionReportChannel, number>> = {};
  const invalidate = (channel: ProductionReportChannel) => { sequences[channel] = (sequences[channel] ?? 0) + 1; };
  return {
    getContext: () => ({ ...context }),
    setContext: (nextDate, nextSource) => {
      if (context.date !== nextDate || context.source !== nextSource) {
        context = { date: nextDate, source: nextSource };
        revision += 1;
      }
    },
    begin: (channel) => {
      invalidate(channel);
      return { ...context, revision, sequence: sequences[channel]!, channel };
    },
    isCurrent: (ticket) => ticket.revision === revision && ticket.sequence === sequences[ticket.channel],
    invalidate,
    invalidateAll: () => { revision += 1; },
  };
}

export function getConfirmedSendRequest(coordinator: ProductionReportCoordinator, ticket: ProductionReportTicket) {
  if (!coordinator.isCurrent(ticket) || ticket.source === null) return null;
  return { url: `/api/production/send?date=${encodeURIComponent(ticket.date)}`, body: { confirmRepeat: true } };
}

export function getConfirmedSourceRequest(coordinator: ProductionReportCoordinator, ticket: ProductionReportTicket, role: string | undefined) {
  if (!coordinator.isCurrent(ticket)) return null;
  const action = getSourceSwitchAction(role, ticket.source);
  return action ? { url: "/api/production/source", body: { dataSource: action.target } } : null;
}
