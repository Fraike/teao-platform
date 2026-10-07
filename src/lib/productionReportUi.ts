import { ApiError } from "./api.ts";
import type {
  ProductionReportChannel, ProductionReportCoordinator, ProductionReportTicket,
} from "../types/productionReport.ts";

export function formatReportRate(rate: number | null | undefined, digits = 1): string {
  return rate == null ? "—" : `${(rate * 100).toFixed(digits)}%`;
}

export function requiresRepeatConfirmation(error: unknown): boolean {
  return error instanceof ApiError && error.code === "REPEAT_CONFIRMATION_REQUIRED";
}

function parseDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value : null;
}

export function getDefaultProductionReportRange(today: string): { dateFrom: string; dateTo: string } {
  const todayValue = parseDate(today);
  if (todayValue === null) throw new Error("日期格式无效");
  const dateToValue = todayValue - 86400000;
  return {
    dateFrom: new Date(dateToValue - 6 * 86400000).toISOString().slice(0, 10),
    dateTo: new Date(dateToValue).toISOString().slice(0, 10),
  };
}

export function validateProductionReportRange(dateFrom: string, dateTo: string): string | null {
  const from = parseDate(dateFrom);
  const to = parseDate(dateTo);
  if (from === null || to === null) return "日期格式无效";
  if (from > to) return "开始日期不能晚于结束日期";
  if (Math.floor((to - from) / 86400000) + 1 > 365) return "单次最多查询365个自然日";
  return null;
}

export function isSingleDayRange(dateFrom: string, dateTo: string): boolean {
  return dateFrom === dateTo;
}

export function createProductionReportCoordinator(dateFrom: string, dateTo: string): ProductionReportCoordinator {
  let context = { dateFrom, dateTo };
  let revision = 0;
  const sequences: Partial<Record<ProductionReportChannel, number>> = {};
  const invalidate = (channel: ProductionReportChannel) => { sequences[channel] = (sequences[channel] ?? 0) + 1; };
  return {
    getContext: () => ({ ...context }),
    setContext: (nextDateFrom, nextDateTo) => {
      if (context.dateFrom !== nextDateFrom || context.dateTo !== nextDateTo) {
        context = { dateFrom: nextDateFrom, dateTo: nextDateTo };
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
  if (!coordinator.isCurrent(ticket) || !isSingleDayRange(ticket.dateFrom, ticket.dateTo)) return null;
  return { url: `/api/production/send?date=${encodeURIComponent(ticket.dateFrom)}`, body: { confirmRepeat: true } };
}
