import type { StandardCategory, StandardDetail, StandardListItem, StandardVersion } from "./standard";

export interface StandardPrintProduct {
  standard: StandardDetail;
  version: StandardVersion;
}

export interface StandardPrintOptions {
  generatedAt: string;
  styleUrl: string;
}

export interface StandardPrintModalProps {
  categories: StandardCategory[];
  currentCategory: string;
  currentRows: StandardListItem[];
  onClose: () => void;
}

export interface StandardPrintDetailResponse {
  data: StandardDetail;
  currentCommentsIncluded?: boolean;
}

export type StandardOutputAction = "excel" | "print";

export interface StandardOutputValue {
  key: string;
  label: string;
  value: string;
}

export interface StandardSpecField {
  key: string;
  label: string;
}
