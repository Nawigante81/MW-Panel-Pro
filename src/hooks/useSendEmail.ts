import { useCallback, useEffect, useRef, useState } from 'react';
import { getEmailStatus, getRecentEmailStatuses, sendEmail, type EmailDeliveryStatus, type RecentEmailStatus } from '@/lib/email/sendEmail';
import type { SendEmailPayload, SendEmailResponse } from '@/types/email';

export function useSendEmail() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SendEmailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<EmailDeliveryStatus | null>(null);
  const [recentStatuses, setRecentStatuses] = useState<RecentEmailStatus[]>([]);
  const [lastSentId, setLastSentId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    void getRecentEmailStatuses(5).then(setRecentStatuses).catch(() => setRecentStatuses([]));
    return () => stopPolling();
  }, []);

  const submit = useCallback(async (payload: SendEmailPayload) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setDeliveryStatus(null);
    stopPolling();

    try {
      const response = await sendEmail(payload);
      setSuccess(response);
      setLastSentId(response.id);
      setDeliveryStatus({
        id: response.id,
        status: response.status,
        attempts: 0,
        errorMessage: null,
        sentAt: null,
        updatedAt: null,
      });
      void getRecentEmailStatuses(10).then(setRecentStatuses).catch(() => {});

      pollRef.current = window.setInterval(async () => {
        try {
          const [status, recent] = await Promise.all([
            getEmailStatus(response.id),
            getRecentEmailStatuses(10),
          ]);
          setDeliveryStatus(status);
          setRecentStatuses(recent);
          if (status.status === 'sent' || status.status === 'failed') {
            stopPolling();
          }
        } catch {
          // cichy fallback - status zostaje ostatni znany
        }
      }, 1500);

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd podczas wysyłki email.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatuses = useCallback(async () => {
    const recent = await getRecentEmailStatuses(10);
    setRecentStatuses(recent);

    if (lastSentId) {
      const status = await getEmailStatus(lastSentId);
      setDeliveryStatus(status);
      if (status.status === 'sent' || status.status === 'failed') {
        stopPolling();
      }
    }
  }, [lastSentId]);

  return { send: submit, loading, success, error, deliveryStatus, recentStatuses, refreshStatuses };
}
