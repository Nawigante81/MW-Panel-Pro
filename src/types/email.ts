export interface EmailTemplate {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  subject_template: string;
  html_template: string;
  text_template: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  id: string;
  organization_id: string;
  template_id: string | null;
  related_entity_type: 'client' | 'property' | 'transaction' | 'document' | null;
  related_entity_id: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  html_content: string;
  text_content: string | null;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  provider: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  scheduled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailAttachment {
  id: string;
  email_message_id: string;
  document_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  created_at: string;
}

export type SendEmailPayload = {
  templateCode?: string;
  to: { email: string; name?: string };
  subject?: string;
  html?: string;
  text?: string;
  variables?: Record<string, string>;
  relatedEntityType?: 'client' | 'property' | 'transaction' | 'document';
  relatedEntityId?: string;
  attachmentDocumentIds?: string[];
  scheduledAt?: string | null;
};

export type SendEmailResponse = {
  id: string;
  status: 'queued' | 'failed' | 'sent' | 'sending';
};
