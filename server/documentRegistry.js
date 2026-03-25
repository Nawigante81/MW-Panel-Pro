const PRIORITY_REQUIRED_FIELDS = {
  brokerage_sale_agreement: ['client_name', 'agent_name', 'property_address', 'property_price', 'date'],
  presentation_protocol: ['client_name', 'agent_name', 'property_address', 'date'],
  reservation_agreement: ['client_name', 'property_address', 'property_price', 'date'],
  rodo_consent: ['client_name', 'client_email', 'date'],
  property_card: ['property_address', 'property_type', 'property_area', 'property_price'],
  handover_protocol: ['client_name', 'property_address', 'date'],
};

export const DOCUMENT_DEFINITIONS = [
  {
    key: 'brokerage_sale_agreement',
    name: 'Umowa posrednictwa sprzedazy nieruchomosci',
    category: 'UMOWY',
    templateKey: 'UP',
    templateVersion: 1,
    requiredFields: PRIORITY_REQUIRED_FIELDS.brokerage_sale_agreement,
    outputFormat: 'pdf',
    enabled: true,
    description: 'Umowa posrednictwa sprzedazy.',
    linkedClient: true,
    linkedProperty: true,
    linkedTransaction: true,
    legacyType: 'brokerage_agreement',
    numberingCode: 'UM',
  },
  {
    key: 'presentation_protocol',
    name: 'Protokol prezentacji nieruchomosci',
    category: 'PREZENTACJE_I_OFERTY',
    templateKey: 'PP',
    templateVersion: 1,
    requiredFields: PRIORITY_REQUIRED_FIELDS.presentation_protocol,
    outputFormat: 'pdf',
    enabled: true,
    description: 'Potwierdzenie prezentacji nieruchomosci.',
    linkedClient: true,
    linkedProperty: true,
    linkedTransaction: true,
    legacyType: 'presentation_protocol',
    numberingCode: 'PP',
  },
  {
    key: 'reservation_agreement',
    name: 'Umowa rezerwacyjna',
    category: 'REZERWACJA_I_TRANSAKCJA',
    templateKey: 'PR',
    templateVersion: 1,
    requiredFields: PRIORITY_REQUIRED_FIELDS.reservation_agreement,
    outputFormat: 'pdf',
    enabled: true,
    description: 'Umowa lub potwierdzenie rezerwacji nieruchomosci.',
    linkedClient: true,
    linkedProperty: true,
    linkedTransaction: true,
    legacyType: 'reservation_confirmation',
    numberingCode: 'REZ',
  },
  {
    key: 'rodo_consent',
    name: 'Zgoda RODO',
    category: 'RODO_I_ZGODY',
    templateKey: 'RODO',
    templateVersion: 1,
    requiredFields: PRIORITY_REQUIRED_FIELDS.rodo_consent,
    outputFormat: 'pdf',
    enabled: true,
    description: 'Zgoda i klauzula informacyjna RODO.',
    linkedClient: true,
    linkedProperty: false,
    linkedTransaction: false,
    legacyType: 'other',
    numberingCode: 'RODO',
  },
  {
    key: 'property_card',
    name: 'Karta nieruchomosci',
    category: 'PREZENTACJE_I_OFERTY',
    templateKey: 'KN',
    templateVersion: 1,
    requiredFields: PRIORITY_REQUIRED_FIELDS.property_card,
    outputFormat: 'pdf',
    enabled: true,
    description: 'Karta informacyjna nieruchomosci.',
    linkedClient: true,
    linkedProperty: true,
    linkedTransaction: false,
    legacyType: 'property_card',
    numberingCode: 'KN',
  },
  {
    key: 'handover_protocol',
    name: 'Protokol zdawczo-odbiorczy',
    category: 'WYNAJEM',
    templateKey: 'PZO',
    templateVersion: 1,
    requiredFields: PRIORITY_REQUIRED_FIELDS.handover_protocol,
    outputFormat: 'pdf',
    enabled: true,
    description: 'Protokol przekazania lokalu.',
    linkedClient: true,
    linkedProperty: true,
    linkedTransaction: true,
    legacyType: 'other',
    numberingCode: 'PZO',
  },
  { key: 'brokerage_purchase_agreement', name: 'Umowa posrednictwa kupna nieruchomosci', category: 'UMOWY', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Umowa posrednictwa kupna.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'UMK' },
  { key: 'brokerage_rental_agreement', name: 'Umowa posrednictwa najmu', category: 'UMOWY', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Umowa posrednictwa najmu.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'UMN' },
  { key: 'exclusive_brokerage_agreement', name: 'Umowa posrednictwa na wylacznosc', category: 'UMOWY', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Umowa na wylacznosc.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'UMW' },
  { key: 'brokerage_annex', name: 'Aneks do umowy posrednictwa', category: 'UMOWY', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Aneks umowy.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'ANX' },
  { key: 'brokerage_termination', name: 'Rozwiazanie umowy posrednictwa', category: 'UMOWY', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Rozwiazanie umowy.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'RUP' },
  { key: 'power_of_attorney', name: 'Pelnomocnictwo', category: 'UMOWY', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Pelnomocnictwo.', linkedClient: true, linkedProperty: false, linkedTransaction: false, numberingCode: 'PEL' },
  { key: 'property_technical_card', name: 'Karta techniczna nieruchomosci', category: 'PREZENTACJE_I_OFERTY', templateKey: 'KN', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Karta techniczna.', linkedClient: false, linkedProperty: true, linkedTransaction: false, numberingCode: 'KTN' },
  { key: 'client_needs_form', name: 'Formularz zapotrzebowania klienta', category: 'PREZENTACJE_I_OFERTY', templateKey: 'ZP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Zapotrzebowanie klienta.', linkedClient: true, linkedProperty: false, linkedTransaction: false, numberingCode: 'FZK' },
  { key: 'offer_acknowledgement', name: 'Potwierdzenie zapoznania sie z oferta', category: 'PREZENTACJE_I_OFERTY', templateKey: 'PP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Potwierdzenie zapoznania.', linkedClient: true, linkedProperty: true, linkedTransaction: false, numberingCode: 'PZOF' },
  { key: 'viewing_list', name: 'Lista osob ogladajacych', category: 'PREZENTACJE_I_OFERTY', templateKey: 'PP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Lista osob ogladajacych.', linkedClient: false, linkedProperty: true, linkedTransaction: false, numberingCode: 'LOO' },
  { key: 'purchase_offer', name: 'Oferta zakupu nieruchomosci', category: 'REZERWACJA_I_TRANSAKCJA', templateKey: 'PR', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Oferta zakupu.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'OZ' },
  { key: 'reservation_confirmation', name: 'Rezerwacja nieruchomosci', category: 'REZERWACJA_I_TRANSAKCJA', templateKey: 'PR', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Potwierdzenie rezerwacji.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'REZ' },
  { key: 'deposit_receipt', name: 'Potwierdzenie przyjecia zadatku', category: 'REZERWACJA_I_TRANSAKCJA', templateKey: 'PR', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Potwierdzenie zadatku.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'ZAD' },
  { key: 'advance_receipt', name: 'Potwierdzenie przyjecia zaliczki', category: 'REZERWACJA_I_TRANSAKCJA', templateKey: 'PR', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Potwierdzenie zaliczki.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'ZAL' },
  { key: 'service_completion_confirmation', name: 'Potwierdzenie wykonania uslugi posrednictwa', category: 'REZERWACJA_I_TRANSAKCJA', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Potwierdzenie wykonania uslugi.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'PWU' },
  { key: 'rodo_information_clause', name: 'Klauzula informacyjna RODO', category: 'RODO_I_ZGODY', templateKey: 'RODO', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Klauzula RODO.', linkedClient: true, linkedProperty: false, linkedTransaction: false, numberingCode: 'RKI' },
  { key: 'marketing_consent', name: 'Zgoda marketingowa', category: 'RODO_I_ZGODY', templateKey: 'RODO', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Zgoda marketingowa.', linkedClient: true, linkedProperty: false, linkedTransaction: false, numberingCode: 'RZM' },
  { key: 'photo_publication_consent', name: 'Zgoda na publikacje zdjec nieruchomosci', category: 'RODO_I_ZGODY', templateKey: 'RODO', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Zgoda publikacji zdjec.', linkedClient: true, linkedProperty: true, linkedTransaction: false, numberingCode: 'RZZ' },
  { key: 'address_publication_consent', name: 'Zgoda na publikacje adresu', category: 'RODO_I_ZGODY', templateKey: 'RODO', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Zgoda publikacji adresu.', linkedClient: true, linkedProperty: true, linkedTransaction: false, numberingCode: 'RZA' },
  { key: 'contact_consent', name: 'Zgoda na kontakt telefoniczny/email', category: 'RODO_I_ZGODY', templateKey: 'RODO', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Zgoda kontaktowa.', linkedClient: true, linkedProperty: false, linkedTransaction: false, numberingCode: 'RZK' },
  { key: 'lease_agreement', name: 'Umowa najmu', category: 'WYNAJEM', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Umowa najmu.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'UN' },
  { key: 'occasional_lease_agreement', name: 'Umowa najmu okazjonalnego', category: 'WYNAJEM', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Umowa najmu okazjonalnego.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'UNO' },
  { key: 'inventory_list', name: 'Lista wyposazenia lokalu', category: 'WYNAJEM', templateKey: 'PZO', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Lista wyposazenia.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'LWL' },
  { key: 'meter_readings', name: 'Stan licznikow', category: 'WYNAJEM', templateKey: 'PZO', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Stan licznikow.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'SL' },
  { key: 'lease_annex', name: 'Aneks do umowy najmu', category: 'WYNAJEM', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Aneks najmu.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'AN' },
  { key: 'owner_legal_statement', name: 'Oswiadczenie wlasciciela o stanie prawnym', category: 'OSWIADCZENIA', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Oswiadczenie prawne.', linkedClient: true, linkedProperty: true, linkedTransaction: false, numberingCode: 'OSP' },
  { key: 'no_debt_statement', name: 'Oswiadczenie o braku zadluzen', category: 'OSWIADCZENIA', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Brak zadluzen.', linkedClient: true, linkedProperty: true, linkedTransaction: false, numberingCode: 'OBZ' },
  { key: 'no_registered_people_statement', name: 'Oswiadczenie o braku osob zameldowanych', category: 'OSWIADCZENIA', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Brak osob zameldowanych.', linkedClient: true, linkedProperty: true, linkedTransaction: false, numberingCode: 'OBM' },
  { key: 'technical_condition_statement', name: 'Oswiadczenie o stanie technicznym', category: 'OSWIADCZENIA', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Stan techniczny.', linkedClient: true, linkedProperty: true, linkedTransaction: false, numberingCode: 'OST' },
  { key: 'commission_confirmation', name: 'Potwierdzenie prowizji', category: 'FINANSOWE_I_ADMINISTRACYJNE', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Potwierdzenie prowizji.', linkedClient: true, linkedProperty: true, linkedTransaction: true, numberingCode: 'PROW' },
  { key: 'agent_commission_settlement', name: 'Rozliczenie prowizji agenta', category: 'FINANSOWE_I_ADMINISTRACYJNE', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Rozliczenie prowizji agenta.', linkedClient: false, linkedProperty: false, linkedTransaction: true, numberingCode: 'RPA' },
  { key: 'office_regulations', name: 'Regulamin biura', category: 'FINANSOWE_I_ADMINISTRACYJNE', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Regulamin biura.', linkedClient: false, linkedProperty: false, linkedTransaction: false, numberingCode: 'RB' },
  { key: 'privacy_policy', name: 'Polityka prywatnosci', category: 'FINANSOWE_I_ADMINISTRACYJNE', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Polityka prywatnosci.', linkedClient: false, linkedProperty: false, linkedTransaction: false, numberingCode: 'PPV' },
  { key: 'data_processing_authorization', name: 'Upowaznienie do przetwarzania danych', category: 'FINANSOWE_I_ADMINISTRACYJNE', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Upowaznienie danych.', linkedClient: false, linkedProperty: false, linkedTransaction: false, numberingCode: 'UPD' },
  { key: 'processing_register', name: 'Rejestr czynnosci przetwarzania danych', category: 'FINANSOWE_I_ADMINISTRACYJNE', templateKey: 'UP', templateVersion: 1, requiredFields: [], outputFormat: 'pdf', enabled: true, description: 'Rejestr RODO.', linkedClient: false, linkedProperty: false, linkedTransaction: false, numberingCode: 'RCPD' },
];

const LEGACY_TYPE_TO_KEY = Object.fromEntries(
  DOCUMENT_DEFINITIONS.filter((item) => item.legacyType).map((item) => [item.legacyType, item.key])
);

const KEY_TO_DEFINITION = Object.fromEntries(DOCUMENT_DEFINITIONS.map((item) => [item.key, item]));

export const resolveDocumentDefinition = ({ documentType, templateKey }) => {
  const normalizedType = documentType && KEY_TO_DEFINITION[documentType] ? documentType : LEGACY_TYPE_TO_KEY[documentType] || null;
  if (normalizedType && KEY_TO_DEFINITION[normalizedType]) {
    return KEY_TO_DEFINITION[normalizedType];
  }
  if (templateKey) {
    const match = DOCUMENT_DEFINITIONS.find((item) => item.templateKey === templateKey && item.enabled);
    if (match) return match;
  }
  return null;
};

export const normalizeDocumentType = (value, templateKey) => {
  if (!value && !templateKey) return 'other';
  const definition = resolveDocumentDefinition({ documentType: value, templateKey });
  if (definition) return definition.key;
  return value || 'other';
};

export const getNumberingCode = (documentType, templateKey) => {
  const definition = resolveDocumentDefinition({ documentType, templateKey });
  if (!definition) return 'DOC';
  return definition.numberingCode || 'DOC';
};

export const generateDocumentNumber = (db, {
  agencyId,
  documentType,
  templateKey,
  year = new Date().getFullYear(),
  prefix = 'MWP',
}) => {
  const code = getNumberingCode(documentType, templateKey);
  const like = `${prefix}/${code}/${year}/%`;
  const row = db
    .prepare(`
      SELECT MAX(CAST(substr(document_number, -4) AS INTEGER)) as max_seq
      FROM documents
      WHERE agency_id = @agency_id AND document_number LIKE @number_like
    `)
    .get({
      agency_id: agencyId,
      number_like: like,
    });

  const next = Number(row?.max_seq || 0) + 1;
  return `${prefix}/${code}/${year}/${String(next).padStart(4, '0')}`;
};

export const validateDocumentPayload = (documentType, templateKey, payloadSnapshot) => {
  const definition = resolveDocumentDefinition({ documentType, templateKey });
  if (!definition) return [];
  const requiredFields = definition.requiredFields || [];
  const source = payloadSnapshot && typeof payloadSnapshot === 'object' ? payloadSnapshot : {};
  return requiredFields.filter((field) => {
    const value = source[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
};

export const DEFAULT_TRANSACTION_CHECKLIST = [
  { itemKey: 'brokerage_sale_agreement', itemLabel: 'Umowa posrednictwa', isRequired: true },
  { itemKey: 'rodo_consent', itemLabel: 'Zgody RODO', isRequired: true },
  { itemKey: 'ownership_documents', itemLabel: 'Dokument wlasnosci', isRequired: true },
  { itemKey: 'presentation_protocol', itemLabel: 'Protokol prezentacji', isRequired: true },
  { itemKey: 'reservation_agreement', itemLabel: 'Rezerwacja', isRequired: false },
  { itemKey: 'financing', itemLabel: 'Finansowanie', isRequired: false },
  { itemKey: 'notarial_deed', itemLabel: 'Akt notarialny', isRequired: true },
  { itemKey: 'handover_protocol', itemLabel: 'Protokol przekazania', isRequired: true },
  { itemKey: 'commission_confirmation', itemLabel: 'Rozliczenie prowizji', isRequired: true },
];
