import { apiJsonFetch } from '@/utils/apiClient';
import type { SendEmailPayload, SendEmailResponse } from '@/types/email';

export type EmailDeliveryStatus = {
  id: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  attempts: number;
  errorMessage: string | null;
  sentAt: string | null;
  updatedAt: string | null;
};

export type RecentEmailStatus = EmailDeliveryStatus & {
  toEmail: string;
  subject: string;
  createdAt: string | null;
};

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResponse> {
  return apiJsonFetch<SendEmailResponse>('/emails/enqueue', { method: 'POST' }, payload);
}

export async function getEmailStatus(id: string): Promise<EmailDeliveryStatus> {
  return apiJsonFetch<EmailDeliveryStatus>(`/emails/${encodeURIComponent(id)}/status`, { method: 'GET' }, {});
}

export async function getRecentEmailStatuses(limit = 5): Promise<RecentEmailStatus[]> {
  return apiJsonFetch<RecentEmailStatus[]>(`/emails/recent?limit=${encodeURIComponent(String(limit))}`, { method: 'GET' }, {});
}

export async function processEmailQueue(limit = 20): Promise<{ processed: number; sent: number; failed: number }> {
  return apiJsonFetch<{ processed: number; sent: number; failed: number }>(
    '/emails/process',
    { method: 'POST' },
    { limit }
  );
}
