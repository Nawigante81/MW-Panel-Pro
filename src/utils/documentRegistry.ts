export type DocumentCategory =
  | 'UMOWY'
  | 'PREZENTACJE_I_OFERTY'
  | 'REZERWACJA_I_TRANSAKCJA'
  | 'RODO_I_ZGODY'
  | 'WYNAJEM'
  | 'OSWIADCZENIA'
  | 'FINANSOWE_I_ADMINISTRACYJNE';

export interface DocumentDefinition {
  key: string;
  name: string;
  category: DocumentCategory | string;
  templateKey: string;
  templateVersion: number;
  requiredFields: string[];
  outputFormat: string;
  enabled: boolean;
  description?: string;
  linkedClient: boolean;
  linkedProperty: boolean;
  linkedTransaction: boolean;
  legacyType?: string;
  numberingCode: string;
}

export const TEMPLATE_TO_DOCUMENT_KEY: Record<string, string> = {
  UP: 'brokerage_sale_agreement',
  PP: 'presentation_protocol',
  KN: 'property_card',
  PR: 'reservation_agreement',
  RODO: 'rodo_consent',
  PZO: 'handover_protocol',
  ZP: 'client_needs_form',
};

export const DOCUMENT_KEY_TO_LEGACY_TYPE: Record<string, string> = {
  brokerage_sale_agreement: 'brokerage_agreement',
  presentation_protocol: 'presentation_protocol',
  property_card: 'property_card',
  reservation_agreement: 'reservation_confirmation',
  rodo_consent: 'other',
  handover_protocol: 'other',
  client_needs_form: 'search_order',
};

export const getDocumentKeyByTemplate = (templateKey: string) =>
  TEMPLATE_TO_DOCUMENT_KEY[templateKey] || 'other';

export const getLegacyTypeByDocumentKey = (documentKey: string) =>
  DOCUMENT_KEY_TO_LEGACY_TYPE[documentKey] || 'other';
