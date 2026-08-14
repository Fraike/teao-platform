export interface ProcessStep {
  title: string;
  description?: string;
  responsible?: string;
  input?: string;
  output?: string;
}

export interface ProcessAttachment {
  name: string;
  url: string;
}

export interface ProcessVersion {
  version: string;
  date: string;
  description: string;
}

export interface ProcessResponsibility {
  department: string;
  duty: string;
}

export interface ProcessSubprocess {
  title: string;
  inputDocuments?: string;
  steps: ProcessStep[];
}

export interface Process {
  id: string;
  title: string;
  department: string;
  category: string;
  owner: string;
  version: string;
  updatedAt: string;
  status: "生效中" | "修订中" | "已作废";
  source: string;
  documentType: string;
  summary: string;
  purpose: string;
  scope: string;
  relatedDepartments: string[];
  responsibilities: ProcessResponsibility[];
  forms: string[];
  steps: ProcessStep[];
  subprocesses?: ProcessSubprocess[];
  notes: string[];
  attachments: ProcessAttachment[];
  flowchart: string | null;
  history: ProcessVersion[];
}
