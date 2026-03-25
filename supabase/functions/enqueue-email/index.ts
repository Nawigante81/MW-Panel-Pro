import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { renderTemplate, type TemplateVariables } from '../_shared/template.ts';

type RelatedEntityType = 'client' | 'property' | 'transaction' | 'document';

type Payload = {
  templateCode?: string;
  to: { email: string; name?: string };
  subject?: string;
  html?: string;
  text?: string;
  variables?: TemplateVariables;
  relatedEntityType?: RelatedEntityType;
  relatedEntityId?: string;
  attachmentDocumentIds?: string[];
  scheduledAt?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: orgId, error: orgError } = await userClient.rpc('current_organization_id');
    if (orgError || !orgId) {
      return new Response(JSON.stringify({ error: 'Cannot resolve organization_id for user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = (await req.json()) as Payload;

    if (!payload?.to?.email) {
      return new Response(JSON.stringify({ error: 'Missing recipient email (to.email)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let subject = payload.subject?.trim() || '';
    let html = payload.html?.trim() || '';
    let text = payload.text?.trim() || null;
    let templateId: string | null = null;

    if (payload.templateCode) {
      const { data: template, error: templateError } = await userClient
        .from('email_templates')
        .select('id, subject_template, html_template, text_template, is_active')
        .eq('organization_id', orgId)
        .eq('code', payload.templateCode)
        .single();

      if (templateError || !template || !template.is_active) {
        return new Response(JSON.stringify({ error: 'Template not found or inactive' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      templateId = template.id;
      const vars = payload.variables ?? {};
      subject = renderTemplate(template.subject_template, vars).trim();
      html = renderTemplate(template.html_template, vars).trim();
      text = template.text_template ? renderTemplate(template.text_template, vars).trim() : null;
    }

    if (!subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing subject/html or templateCode' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: insertedMessage, error: insertError } = await userClient
      .from('email_messages')
      .insert({
        organization_id: orgId,
        template_id: templateId,
        related_entity_type: payload.relatedEntityType ?? null,
        related_entity_id: payload.relatedEntityId ?? null,
        to_email: payload.to.email,
        to_name: payload.to.name ?? null,
        subject,
        html_content: html,
        text_content: text,
        status: 'queued',
        scheduled_at: payload.scheduledAt ?? null,
        created_by: userData.user.id,
      })
      .select('id, status')
      .single();

    if (insertError || !insertedMessage) {
      return new Response(JSON.stringify({ error: insertError?.message ?? 'Failed to queue email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (Array.isArray(payload.attachmentDocumentIds) && payload.attachmentDocumentIds.length > 0) {
      const { data: docs, error: docsError } = await adminClient
        .from('documents')
        .select('*')
        .in('id', payload.attachmentDocumentIds);

      if (docsError) {
        await adminClient
          .from('email_messages')
          .update({ status: 'failed', error_message: `Attachment lookup failed: ${docsError.message}` })
          .eq('id', insertedMessage.id);

        return new Response(JSON.stringify({ error: `Attachment lookup failed: ${docsError.message}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const validDocs = (docs ?? []).filter((doc) => {
        const docOrg = doc.organization_id ?? doc.agency_id;
        return docOrg === orgId;
      });

      const attachmentRows = validDocs
        .map((doc) => {
          const storagePath = doc.storage_path ?? doc.storage_key ?? null;
          if (!storagePath) return null;

          return {
            email_message_id: insertedMessage.id,
            document_id: doc.id,
            file_name: doc.file_name ?? `${doc.title ?? 'dokument'}.pdf`,
            storage_path: storagePath,
            mime_type: doc.mime_type ?? 'application/pdf',
          };
        })
        .filter(Boolean);

      if (attachmentRows.length > 0) {
        const { error: attachError } = await userClient.from('email_attachments').insert(attachmentRows as any[]);

        if (attachError) {
          await adminClient
            .from('email_messages')
            .update({ status: 'failed', error_message: `Attachment insert failed: ${attachError.message}` })
            .eq('id', insertedMessage.id);

          return new Response(JSON.stringify({ error: `Attachment insert failed: ${attachError.message}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    return new Response(JSON.stringify({ id: insertedMessage.id, status: insertedMessage.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
