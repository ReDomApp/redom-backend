import { api } from "../api/client";

export type BugReportAttachment = { filename:string; contentType:string; data:string };
export type BugReportPayload = {
  product:string;
  category:string;
  description:string;
  includeDiagnostics:boolean;
  diagnostics?:Record<string,unknown>;
  attachments:BugReportAttachment[];
};
export const bugReportService = {
  submit(payload:BugReportPayload) {
    return api.post<{success:boolean;report:{reportId:string;product:string;category:string;status:string;emailStatus:string;submittedAt:string}}>("/bug-reports",payload);
  },
  get(reportId:string) {
    return api.get<{success:boolean;report:Record<string,unknown>}>(`/bug-reports/${reportId}`);
  },
};
