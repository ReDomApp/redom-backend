import { api } from "../api/client";

export type ProblemReportAttachment = {
  filename: string;
  contentType: string;
  data: string;
};

export type ProblemReportInput = {
  product: string;
  category: string;
  description: string;
  includeDiagnostics: boolean;
  diagnostics?: Record<string, unknown> | null;
  attachments?: ProblemReportAttachment[];
};

export type ProblemReportResult = {
  reportId: string;
  product: string;
  category: string;
  status: string;
  emailStatus: string;
  submittedAt: string;
};

export const bugReportService = {
  submit(input: ProblemReportInput) {
    return api.post<{ success: boolean; report: ProblemReportResult }>("/bug-reports", input);
  },
  get(reportId: string) {
    return api.get<{ success: boolean; report: ProblemReportResult & { description: string; fix_required: string; emailed_at: string | null } }>(`/bug-reports/${reportId}`);
  },
};
