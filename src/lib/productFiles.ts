import { ApiError, getToken, refreshAuthToken } from './api';
import type { ProductDrawingInput } from '../types/product';

export async function productBinary(url: string, options: RequestInit = {}): Promise<Blob> {
  const send = (token: string | null) => fetch(url, {
    ...options, headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let response = await send(getToken());
  if (response.status === 401) {
    const token = await refreshAuthToken();
    if (token) response = await send(token);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || `文件操作失败 (${response.status})`, response.status);
  }
  return response.blob();
}
export async function uploadProductFile(productId: string, input: ProductDrawingInput, file: File) {
  const query = new URLSearchParams({ metadata: JSON.stringify(input) });
  await productBinary(`/api/products/${productId}/files?${query}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
  });
}
export function saveProductBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
