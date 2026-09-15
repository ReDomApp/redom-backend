import { api } from "../api/client";
import type { LanguageCode } from "../i18n/language";

export interface GroupReportResult {
  reportId: string;
  status: string;
  decision: string;
  categories: string[];
  evidenceCount: number;
  emailNotificationEligible: boolean;
  emailNotificationSent: boolean;
  groupName: string;
}

export const groupReportService = {
  submit(conversationId: string, input: { reason: string; details?: string; exitAfterReport: boolean; language: LanguageCode }) {
    return api.post<{ success: boolean; reported: boolean } & GroupReportResult>(`/messages/groups/${conversationId}/report`, input);
  },
  get(reportId: string) {
    return api.get<{ success: boolean; report: any }>(`/messages/reports/${reportId}`);
  },
};
