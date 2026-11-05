import {api} from './api';
import type {StandardListItem} from '../types/standard';

export async function findCustomerProductStandards(number: string, signal: AbortSignal) {
  const matches: StandardListItem[] = [];
  const serialNo = number.trim();
  if (!serialNo) return matches;
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({serialNo, page: String(page), pageSize: '200', excludeObsolete: 'true'});
    const response = await api.get<{data: StandardListItem[]; total: number}>(`/api/standards?${params}`, {signal});
    matches.push(...response.data.filter(row => row.serialNo.trim() === serialNo));
    if (!response.data.length || page * 200 >= response.total) return matches;
  }
}
