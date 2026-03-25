import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const RESEND_URL = 'https://api.resend.com/emails';

type QueuedMessage = {
  id: string;
  organization_id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  html_content: string;
  text_content: string | null;
  attempts: number;
};

type AttachmentRow = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  document_id: string | null;
};

function buildRecipient(email: string, name: string | null): string {
  return name ? `${name} <${email}>` : email;
}

async function toBase64(bytes: ArrayBuffer): Promise<string> {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'admin@mwpanel.pl';
    const documentsBucket = Deno.env.get('EMAIL_ATTACHMENTS_BUCKET') || 'documents';
    const processToken = Deno.env.get('PROCESS_EMAIL_QUEUE_TOKEN');

    if (processToken) {
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (token !== processToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized queue processor call' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Missing RESEND_API_KEY env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit ?? 20), 100);

    const { data: claimed, error: claimError } = await adminClient.rpc('claim_email_messages', { p_limit: limit });

    if (claimError) {
      return new Response(JSON.stringify({ error: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messages = (claimed ?? []) as QueuedMessage[];
    const results: Array<{ id: string; status: 'sent' | 'failed'; error?: string }> = [];

    for (const message of messages) {

      const { data: attachmentsData } = await adminClient
        .from('email_attachments')
        .select('id, file_name, storage_path, mime_type, document_id')
        .eq('email_message_id', message.id);

      const attachments = (attachmentsData ?? []) as AttachmentRow[];
      const resendAttachments: Array<{ filename: string; content: string; content_type: string }> = [];

      for (const attachment of attachments) {
        try {
          const { data: fileData, error: fileErr } = await adminClient.storage
            .from(documentsBucket)
            .download(attachment.storage_path);

          if (!fileErr && fileData) {
            const bytes = await fileData.arrayBuffer();
            resendAttachments.push({
              filename: attachment.file_name,
              content: await toBase64(bytes),
              content_type: attachment.mime_type || 'application/pdf',
            });
            continue;
          }

          const { data: docData } = await adminClient
            .from('documents')
            .select('*')
            .eq('id', attachment.document_id)
            .single();

          const fallbackUrl = docData?.pdf_url ?? docData?.file_url ?? null;
          if (fallbackUrl) {
            const fileResp = await fetch(fallbackUrl);
            if (fileResp.ok) {
              const bytes = await fileResp.arrayBuffer();
              resendAttachments.push({
                filename: attachment.file_name,
                content: await toBase64(bytes),
                content_type: attachment.mime_type || 'application/pdf',
              });
            }
          }
        } catch {
          // Ignore single attachment failures, message still can be sent without this file.
        }
      }

      try {
        const resendPayload: Record<string, unknown> = {
          from: emailFrom,
          to: [buildRecipient(message.to_email, message.to_name)],
          subject: message.subject,
          html: message.html_content,
        };

        if (message.text_content) resendPayload.text = message.text_content;
        if (resendAttachments.length > 0) resendPayload.attachments = resendAttachments;

        const resendResp = await fetch(RESEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(resendPayload),
        });

        const resendJson = await resendResp.json().catch(() => ({}));

        if (!resendResp.ok) {
          const errorMessage = resendJson?.message || resendJson?.error || `Resend error ${resendResp.status}`;

          await adminClient
            .from('email_messages')
            .update({ status: 'failed', provider: 'resend', error_message: String(errorMessage) })
            .eq('id', message.id);

          results.push({ id: message.id, status: 'failed', error: String(errorMessage) });
          continue;
        }

        await adminClient
          .from('email_messages')
          .update({
            status: 'sent',
            provider: 'resend',
            provider_message_id: resendJson?.id ?? null,
            error_message: null,
            sent_at: new Date().toISOString(),
          })
          .eq('id', message.id);

        results.push({ id: message.id, status: 'sent' });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown send error';

        await adminClient
          .from('email_messages')
          .update({ status: 'failed', provider: 'resend', error_message: errMsg })
          .eq('id', message.id);

        results.push({ id: message.id, status: 'failed', error: errMsg });
      }
    }

    return new Response(
      JSON.stringify({ processed: messages.length, sent: results.filter((r) => r.status === 'sent').length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
