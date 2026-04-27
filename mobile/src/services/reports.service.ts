import api from "../config/api";

export type ReportReason =
  | "child_safety"
  | "harassment"
  | "impersonation"
  | "spam"
  | "inappropriate_content"
  | "other";

export interface SubmitReportPayload {
  reason: ReportReason;
  reported_user_id?: string;
  details?: string;
}

export async function submitReport(payload: SubmitReportPayload): Promise<void> {
  await api.post("/reports", payload);
}
