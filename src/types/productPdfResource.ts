export interface PdfResourceDocument { destroy(): Promise<void> }
export interface PdfResourceLoader<T extends PdfResourceDocument> { fetch(key: string): Promise<Blob>; parse(blob: Blob): Promise<T> }
