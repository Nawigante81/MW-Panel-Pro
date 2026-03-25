import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Building2, Download, Eye, FileText, Hash, Printer, User } from 'lucide-react';
import QRCode from 'qrcode';
import ContextHelpButton from './ContextHelpButton'
import InlineFieldHelp from './InlineFieldHelp'
import { getContextHelp } from './helpContent'

import baseTemplate from '../../Docgenerator/templates/base_document.html?raw';
import mwLogoSvg from '../../Logo/mw-logo.svg?raw';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import { DocumentStatus, DocumentType } from '../types';
import { apiFetch } from '../utils/apiClient';
import {
  DocumentDefinition,
  getDocumentKeyByTemplate,
  getLegacyTypeByDocumentKey,
} from '../utils/documentRegistry';
import { findMissingRequiredFields, mapDocumentPayload } from '../utils/documentDataMappers';

type TemplateKey = 'UP' | 'PP' | 'KN' | 'PR' | 'ZP' | 'RODO' | 'PZO';
type LocalStatus = 'draft' | 'sent' | 'signed' | 'archived';

type TemplateConfig = {
  code: TemplateKey;
  label: string;
  color: keyof typeof COLOR_MAP;
  title: string;
};

type DocumentMeta = {
  id: string;
  number: string;
  version: number;
  status: LocalStatus;
};

const TEMPLATES: Record<TemplateKey, TemplateConfig> = {
  UP: { code: 'UP', label: 'Umowa Posrednictwa', color: 'blue', title: 'Umowa posrednictwa w obrocie nieruchomosciami' },
  PP: { code: 'PP', label: 'Protokol Prezentacji', color: 'green', title: 'Protokol prezentacji nieruchomosci' },
  KN: { code: 'KN', label: 'Karta Nieruchomosci', color: 'purple', title: 'Karta nieruchomosci' },
  PR: { code: 'PR', label: 'Potwierdzenie Rezerwacji', color: 'orange', title: 'Potwierdzenie rezerwacji' },
  ZP: { code: 'ZP', label: 'Zlecenie Poszukiwania', color: 'teal', title: 'Zlecenie poszukiwania nieruchomosci' },
  RODO: { code: 'RODO', label: 'Zgoda RODO', color: 'teal', title: 'Zgoda RODO i klauzula informacyjna' },
  PZO: { code: 'PZO', label: 'Protokol Zdawczo-Odbiorczy', color: 'green', title: 'Protokol zdawczo-odbiorczy' },
};

const STATUS_LABELS: Record<LocalStatus, string> = {
  draft: 'draft',
  sent: 'sent',
  signed: 'signed',
  archived: 'archived',
};

const AGENCY = {
  name: 'MW Partner Michał Walenkiewicz Partnership',
  nip: '615-19-45-090',
  address: 'ul. 10 Lutego 16, 81-364 Gdynia',
  phone: '+48 516 949 612',
  email: 'kontakt@mwpartner.pl',
  website: 'https://mwpartner.pl',
};

const CORE_FIELDS = [
  'agency_name',
  'agency_nip',
  'agency_address',
  'agency_phone',
  'agency_email',
  'agency_website',
  'document_title',
  'document_number',
  'date',
  'document_place',
  'document_status',
  'client_name',
  'client_address',
  'client_phone',
  'client_email',
  'agent_name',
  'property_address',
  'property_type',
  'property_area',
  'property_rooms',
  'property_price',
  'property_market',
  'property_legal_status',
  'property_floor',
  'property_building_type',
  'property_land_area',
  'document_terms',
  'document_notes',
] as const;

const FIELD_LABELS: Record<string, string> = {
  agency_name: 'Nazwa agencji',
  agency_nip: 'NIP agencji',
  agency_address: 'Adres agencji',
  agency_phone: 'Telefon agencji',
  agency_email: 'Email agencji',
  agency_website: 'Strona WWW',
  document_title: 'Tytul dokumentu',
  document_number: 'Numer dokumentu',
  date: 'Data',
  document_place: 'Miejsce',
  document_status: 'Status',
  client_name: 'Klient',
  agent_name: 'Agent',
  property_address: 'Adres nieruchomosci',
  property_type: 'Typ nieruchomosci',
  property_area: 'Powierzchnia',
  property_rooms: 'Pokoje',
  property_price: 'Cena',
  property_market: 'Rynek',
  property_legal_status: 'Stan prawny',
  property_floor: 'Pietro',
  property_building_type: 'Typ budynku',
  property_land_area: 'Pow. dzialki',
  document_terms: 'Warunki umowy',
  document_notes: 'Uwagi',
};

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800',
};

const BORDER_MAP: Record<string, string> = {
  blue: 'border-blue-500',
  green: 'border-green-500',
  purple: 'border-purple-500',
  orange: 'border-orange-500',
  teal: 'border-teal-500',
};

const toIsoDate = () => new Date().toISOString().slice(0, 10);

const hashString = (value: string) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
};

const normalizeTemplateHtml = (html: string) => {
  const lower = html.toLowerCase();
  const first = lower.indexOf('<!doctype html>');
  const second = first >= 0 ? lower.indexOf('<!doctype html>', first + 1) : -1;
  if (second >= 0) return html.slice(second);
  return html;
};

const injectBrandingAssets = (html: string) => {
  const logoHeader = `<div class="header-left"><div style="max-width:200px;">${mwLogoSvg}</div></div>`;
  const watermark = `<div class="watermark"><div style="width:560px;">${mwLogoSvg}</div></div>`;
  return html
    .replace(/<div class="header-left">[\s\S]*?<\/div>/, logoHeader)
    .replace(/<div class="watermark">[\s\S]*?<\/div>/, watermark);
};

// ── Per-template body builders ────────────────────────────────────────────────

const buildBodyUP = (ctx: Record<string, string>) => `
<table class="two-col">
  <tr>
    <td>
      <div class="section break-inside-avoid">
        <div class="section-title">Zamawiający</div>
        <div class="soft-box">
          <table class="data-table">
            <tr><td class="label">Imię i nazwisko / firma</td><td>${ctx.client_name}</td></tr>
            <tr><td class="label">Telefon</td><td>${ctx.client_phone}</td></tr>
            <tr><td class="label">Email</td><td>${ctx.client_email}</td></tr>
            <tr><td class="label">Adres</td><td>${ctx.client_address}</td></tr>
          </table>
        </div>
      </div>
    </td>
    <td>
      <div class="section break-inside-avoid">
        <div class="section-title">Pośrednik</div>
        <div class="soft-box">
          <table class="data-table">
            <tr><td class="label">Agencja</td><td>${ctx.agency_name}</td></tr>
            <tr><td class="label">NIP</td><td>${ctx.agency_nip}</td></tr>
            <tr><td class="label">Adres</td><td>${ctx.agency_address}</td></tr>
            <tr><td class="label">Telefon</td><td>${ctx.agency_phone}</td></tr>
            <tr><td class="label">Email</td><td>${ctx.agency_email}</td></tr>
            <tr><td class="label">Agent prowadzący</td><td>${ctx.agent_name}</td></tr>
          </table>
        </div>
      </div>
    </td>
  </tr>
</table>

<div class="section break-inside-avoid">
  <div class="section-title">Przedmiot umowy</div>
  <table class="property-grid">
    <tr><td class="head">Adres</td><td>${ctx.property_address}</td><td class="head">Typ</td><td>${ctx.property_type}</td></tr>
    <tr><td class="head">Powierzchnia</td><td>${ctx.property_area}</td><td class="head">Liczba pokoi</td><td>${ctx.property_rooms}</td></tr>
    <tr><td class="head">Cena ofertowa</td><td>${ctx.property_price}</td><td class="head">Rynek</td><td>${ctx.property_market}</td></tr>
    <tr><td class="head">Piętro</td><td>${ctx.property_floor}</td><td class="head">Stan prawny</td><td>${ctx.property_legal_status}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">Postanowienia</div>
  <div class="terms">
    <p>1. Zamawiający zleca, a Pośrednik zobowiązuje się do wykonania czynności pośrednictwa w obrocie nieruchomościami dotyczących nieruchomości wskazanej w niniejszym dokumencie.</p>
    <p>2. Pośrednik będzie podejmował działania marketingowe, organizacyjne i handlowe zmierzające do sprzedaży / najmu nieruchomości.</p>
    <p>3. Wynagrodzenie pośrednika, termin obowiązywania oraz warunki współpracy: <b>${ctx.document_terms}</b>.</p>
    <p>4. Dodatkowe uwagi stron: <b>${ctx.document_notes}</b>.</p>
  </div>
</div>

<table class="signatures break-inside-avoid">
  <tr>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Zamawiający</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Agent prowadzący</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">W imieniu ${ctx.agency_name}</div></td>
  </tr>
</table>
`;

const buildBodyPP = (ctx: Record<string, string>) => `
<table class="two-col">
  <tr>
    <td>
      <div class="section break-inside-avoid">
        <div class="section-title">Osoba oglądająca</div>
        <div class="soft-box">
          <table class="data-table">
            <tr><td class="label">Imię i nazwisko</td><td>${ctx.client_name}</td></tr>
            <tr><td class="label">Telefon</td><td>${ctx.client_phone}</td></tr>
            <tr><td class="label">Email</td><td>${ctx.client_email}</td></tr>
            <tr><td class="label">Adres</td><td>${ctx.client_address}</td></tr>
          </table>
        </div>
      </div>
    </td>
    <td>
      <div class="section break-inside-avoid">
        <div class="section-title">Agent prezentujący</div>
        <div class="soft-box">
          <table class="data-table">
            <tr><td class="label">Agent</td><td>${ctx.agent_name}</td></tr>
            <tr><td class="label">Agencja</td><td>${ctx.agency_name}</td></tr>
            <tr><td class="label">Telefon</td><td>${ctx.agency_phone}</td></tr>
            <tr><td class="label">Email</td><td>${ctx.agency_email}</td></tr>
          </table>
        </div>
      </div>
    </td>
  </tr>
</table>

<div class="section break-inside-avoid">
  <div class="section-title">Prezentowana nieruchomość</div>
  <table class="property-grid">
    <tr><td class="head">Adres</td><td>${ctx.property_address}</td><td class="head">Typ</td><td>${ctx.property_type}</td></tr>
    <tr><td class="head">Powierzchnia</td><td>${ctx.property_area}</td><td class="head">Cena ofertowa</td><td>${ctx.property_price}</td></tr>
    <tr><td class="head">Rynek</td><td>${ctx.property_market}</td><td class="head">Pokoje</td><td>${ctx.property_rooms}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">Oświadczenia</div>
  <div class="terms">
    <p>1. Osoba oglądająca potwierdza, że nieruchomość została jej zaprezentowana przez ${ctx.agency_name}.</p>
    <p>2. Prezentacja odbyła się w dniu <b>${ctx.date}</b> w miejscowości <b>${ctx.document_place}</b>.</p>
    <p>3. Dodatkowe ustalenia po prezentacji: <b>${ctx.document_terms}</b>.</p>
    <p>4. Uwagi: <b>${ctx.document_notes}</b>.</p>
  </div>
</div>

<table class="signatures break-inside-avoid">
  <tr>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Osoba oglądająca</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Agent prezentujący</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">W imieniu ${ctx.agency_name}</div></td>
  </tr>
</table>
`;

const buildBodyKN = (ctx: Record<string, string>) => `
<div class="section break-inside-avoid">
  <div class="section-title">Dane podstawowe</div>
  <table class="property-grid">
    <tr><td class="head">Adres</td><td>${ctx.property_address}</td><td class="head">Typ</td><td>${ctx.property_type}</td></tr>
    <tr><td class="head">Powierzchnia</td><td>${ctx.property_area}</td><td class="head">Liczba pokoi</td><td>${ctx.property_rooms}</td></tr>
    <tr><td class="head">Piętro</td><td>${ctx.property_floor}</td><td class="head">Typ budynku</td><td>${ctx.property_building_type}</td></tr>
    <tr><td class="head">Pow. działki</td><td>${ctx.property_land_area}</td><td class="head">Stan prawny</td><td>${ctx.property_legal_status}</td></tr>
    <tr><td class="head">Cena ofertowa</td><td>${ctx.property_price}</td><td class="head">Rynek</td><td>${ctx.property_market}</td></tr>
    <tr><td class="head">Agent</td><td colspan="3">${ctx.agent_name}</td></tr>
  </table>
</div>

<div class="section break-inside-avoid">
  <div class="section-title">Właściciel / klient</div>
  <div class="soft-box">
    <table class="data-table">
      <tr><td class="label">Imię i nazwisko / firma</td><td>${ctx.client_name}</td></tr>
      <tr><td class="label">Telefon</td><td>${ctx.client_phone}</td></tr>
      <tr><td class="label">Email</td><td>${ctx.client_email}</td></tr>
      <tr><td class="label">Adres</td><td>${ctx.client_address}</td></tr>
    </table>
  </div>
</div>

<div class="section">
  <div class="section-title">Opis nieruchomości</div>
  <div class="terms">
    <p>${ctx.document_notes || 'Brak opisu.'}</p>
    <p>Dodatkowe ustalenia operacyjne: <b>${ctx.document_terms}</b>.</p>
  </div>
</div>
`;

const buildBodyPR = (ctx: Record<string, string>) => `
<table class="two-col">
  <tr>
    <td>
      <div class="section break-inside-avoid">
        <div class="section-title">Rezerwujący</div>
        <div class="soft-box">
          <table class="data-table">
            <tr><td class="label">Imię i nazwisko / firma</td><td>${ctx.client_name}</td></tr>
            <tr><td class="label">Telefon</td><td>${ctx.client_phone}</td></tr>
            <tr><td class="label">Email</td><td>${ctx.client_email}</td></tr>
            <tr><td class="label">Adres</td><td>${ctx.client_address}</td></tr>
          </table>
        </div>
      </div>
    </td>
    <td>
      <div class="section break-inside-avoid">
        <div class="section-title">Nieruchomość</div>
        <div class="soft-box">
          <table class="data-table">
            <tr><td class="label">Adres</td><td>${ctx.property_address}</td></tr>
            <tr><td class="label">Typ</td><td>${ctx.property_type}</td></tr>
            <tr><td class="label">Cena</td><td>${ctx.property_price}</td></tr>
            <tr><td class="label">Agent prowadzący</td><td>${ctx.agent_name}</td></tr>
          </table>
        </div>
      </div>
    </td>
  </tr>
</table>

<div class="section">
  <div class="section-title">Treść potwierdzenia</div>
  <div class="terms">
    <p>${ctx.agency_name} potwierdza przyjęcie rezerwacji dotyczącej nieruchomości położonej przy <b>${ctx.property_address}</b>.</p>
    <p>Warunki rezerwacji: <b>${ctx.document_terms}</b>.</p>
    <p>Uwagi: <b>${ctx.document_notes}</b>.</p>
  </div>
</div>

<table class="signatures break-inside-avoid">
  <tr>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Rezerwujący</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Agent prowadzący</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">W imieniu ${ctx.agency_name}</div></td>
  </tr>
</table>
`;

const buildBodyZP = (ctx: Record<string, string>) => `
<div class="section break-inside-avoid">
  <div class="section-title">Zlecający</div>
  <div class="soft-box">
    <table class="data-table">
      <tr><td class="label">Imię i nazwisko / firma</td><td>${ctx.client_name}</td></tr>
      <tr><td class="label">Telefon</td><td>${ctx.client_phone}</td></tr>
      <tr><td class="label">Email</td><td>${ctx.client_email}</td></tr>
      <tr><td class="label">Adres</td><td>${ctx.client_address}</td></tr>
    </table>
  </div>
</div>

<div class="section break-inside-avoid">
  <div class="section-title">Parametry poszukiwanej nieruchomości</div>
  <table class="property-grid">
    <tr><td class="head">Typ</td><td>${ctx.property_type}</td><td class="head">Lokalizacja</td><td>${ctx.property_address}</td></tr>
    <tr><td class="head">Powierzchnia</td><td>${ctx.property_area}</td><td class="head">Pokoje</td><td>${ctx.property_rooms}</td></tr>
    <tr><td class="head">Budżet</td><td>${ctx.property_price}</td><td class="head">Rynek</td><td>${ctx.property_market}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">Zakres zlecenia</div>
  <div class="terms">
    <p>Zlecający zleca ${ctx.agency_name} podjęcie działań mających na celu znalezienie nieruchomości spełniającej wskazane kryteria.</p>
    <p>Agent prowadzący: <b>${ctx.agent_name}</b>.</p>
    <p>Szczegółowe kryteria i warunki: <b>${ctx.document_terms}</b>.</p>
    <p>Dodatkowe uwagi: <b>${ctx.document_notes}</b>.</p>
  </div>
</div>

<table class="signatures break-inside-avoid">
  <tr>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Zlecający</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Agent prowadzący</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">W imieniu ${ctx.agency_name}</div></td>
  </tr>
</table>
`;

const buildBodyRODO = (ctx: Record<string, string>) => `
<div class="section break-inside-avoid">
  <div class="section-title">Dane osoby wyrażającej zgodę</div>
  <div class="soft-box">
    <table class="data-table">
      <tr><td class="label">Imię i nazwisko</td><td>${ctx.client_name}</td></tr>
      <tr><td class="label">Email</td><td>${ctx.client_email}</td></tr>
      <tr><td class="label">Adres</td><td>${ctx.client_address}</td></tr>
    </table>
  </div>
</div>

<div class="section">
  <div class="section-title">Klauzula informacyjna RODO</div>
  <div class="terms">
    <p>Administratorem Pani/Pana danych osobowych jest <b>${ctx.agency_name}</b>, ${ctx.agency_address}, NIP: ${ctx.agency_nip}, tel. ${ctx.agency_phone}, email: ${ctx.agency_email}.</p>
    <p>Dane osobowe będą przetwarzane w celu realizacji usług pośrednictwa w obrocie nieruchomościami oraz wypełnienia obowiązków prawnych administratora.</p>
    <p>Posiada Pani/Pan prawo dostępu do treści swoich danych, sprostowania, usunięcia, ograniczenia przetwarzania, przeniesienia danych, wniesienia sprzeciwu.</p>
    <p>Podanie danych osobowych jest dobrowolne, jednak niezbędne do zawarcia umowy i świadczenia usług.</p>
    <p>Dodatkowe informacje i warunki: <b>${ctx.document_terms}</b>. Uwagi: <b>${ctx.document_notes}</b>.</p>
  </div>
</div>

<table class="signatures break-inside-avoid">
  <tr>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Wyrażający zgodę</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">&nbsp;</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">W imieniu ${ctx.agency_name}</div></td>
  </tr>
</table>
`;

const buildBodyPZO = (ctx: Record<string, string>) => `
<table class="two-col">
  <tr>
    <td>
      <div class="section break-inside-avoid">
        <div class="section-title">Zdający</div>
        <div class="soft-box">
          <table class="data-table">
            <tr><td class="label">Imię i nazwisko</td><td>${ctx.client_name}</td></tr>
            <tr><td class="label">Telefon</td><td>${ctx.client_phone}</td></tr>
            <tr><td class="label">Email</td><td>${ctx.client_email}</td></tr>
            <tr><td class="label">Adres</td><td>${ctx.client_address}</td></tr>
          </table>
        </div>
      </div>
    </td>
    <td>
      <div class="section break-inside-avoid">
        <div class="section-title">Nieruchomość</div>
        <div class="soft-box">
          <table class="data-table">
            <tr><td class="label">Adres</td><td>${ctx.property_address}</td></tr>
            <tr><td class="label">Typ</td><td>${ctx.property_type}</td></tr>
            <tr><td class="label">Powierzchnia</td><td>${ctx.property_area}</td></tr>
            <tr><td class="label">Piętro</td><td>${ctx.property_floor}</td></tr>
          </table>
        </div>
      </div>
    </td>
  </tr>
</table>

<div class="section">
  <div class="section-title">Opis stanu lokalu przy przekazaniu</div>
  <div class="terms">
    <p>Strony potwierdzają przekazanie lokalu w dniu <b>${ctx.date}</b> w miejscowości <b>${ctx.document_place}</b>.</p>
    <p>Stan techniczny i wyposażenie lokalu: <b>${ctx.document_terms}</b>.</p>
    <p>Uwagi dodatkowe: <b>${ctx.document_notes}</b>.</p>
  </div>
</div>

<table class="signatures break-inside-avoid">
  <tr>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Zdający</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Przejmujący</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Agent / Świadek</div></td>
  </tr>
</table>
`;

const buildDocumentBody = (ctx: Record<string, string>, templateKey: TemplateKey): string => {
  switch (templateKey) {
    case 'UP': return buildBodyUP(ctx);
    case 'PP': return buildBodyPP(ctx);
    case 'KN': return buildBodyKN(ctx);
    case 'PR': return buildBodyPR(ctx);
    case 'ZP': return buildBodyZP(ctx);
    case 'RODO': return buildBodyRODO(ctx);
    case 'PZO': return buildBodyPZO(ctx);
    default: return buildBodyUP(ctx);
  }
};

const buildHtml = (ctx: Record<string, string>, body: string) => {
  const merged = {
    ...ctx,
    document_body: body,
    qr_code_image: ctx.qr_code_image || '<span style="font-size:9px;color:#9ca3af">QR</span>',
  };
  const normalized = injectBrandingAssets(normalizeTemplateHtml(baseTemplate));
  return normalized.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => merged[key] ?? '');
};

const statusOptions: LocalStatus[] = ['draft', 'sent', 'signed', 'archived'];

const TEMPLATE_TO_DOCUMENT_TYPE: Record<TemplateKey, DocumentType> = {
  UP: DocumentType.BROKERAGE_AGREEMENT,
  PP: DocumentType.PRESENTATION_PROTOCOL,
  KN: DocumentType.PROPERTY_CARD,
  PR: DocumentType.RESERVATION_CONFIRMATION,
  ZP: DocumentType.SEARCH_ORDER,
  RODO: DocumentType.OTHER,
  PZO: DocumentType.OTHER,
};

const toDocumentStatus = (status: LocalStatus): DocumentStatus => {
  if (status === 'sent') return DocumentStatus.SENT;
  if (status === 'signed') return DocumentStatus.SIGNED;
  if (status === 'archived') return DocumentStatus.ARCHIVED;
  return DocumentStatus.DRAFT;
};

export default function PDFGenerator() {
  const [searchParams] = useSearchParams();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey | null>(null);
  const [selectedDocumentKey, setSelectedDocumentKey] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isUrlPrefillApplied, setIsUrlPrefillApplied] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [documentDefinitions, setDocumentDefinitions] = useState<DocumentDefinition[]>([]);
  const [validationError, setValidationError] = useState<string>('');
  const [selectedTransactionId, setSelectedTransactionId] = useState('');
  const [useAgencyFromSettings, setUseAgencyFromSettings] = useState(true);
  const [isBootstrappingDocument, setIsBootstrappingDocument] = useState(false);
  const bootstrapLockRef = useRef(false);

  const {
    clients,
    properties,
    agents,
    documents,
    fetchClients,
    fetchAgents,
    fetchProperties,
    fetchDocuments,
    createDocumentWithVersion,
    updateDocumentWithVersion,
    getDocumentVersions,
  } = useDataStore();
  const agencyFromSettings = useAuthStore((state) => state.agency);
  const authUser = useAuthStore((state) => state.user);
  const currentAgencyId = agencyFromSettings?.id || authUser?.agencyId || 'agency-1';

  const template = selectedTemplate ? TEMPLATES[selectedTemplate] : null;

  useEffect(() => {
    void fetchClients();
    void fetchAgents();
    void fetchProperties();
    void fetchDocuments();
  }, [fetchClients, fetchAgents, fetchProperties, fetchDocuments]);

  useEffect(() => {
    const loadDefinitions = async () => {
      try {
        const defs = await apiFetch<DocumentDefinition[]>('/document-definitions?activeOnly=true');
        setDocumentDefinitions(defs);
      } catch {
        setDocumentDefinitions([]);
      }
    };
    void loadDefinitions();
  }, []);

  const defaultContext = useMemo(
    () => ({
      agency_name: AGENCY.name,
      agency_nip: AGENCY.nip,
      agency_address: AGENCY.address,
      agency_phone: AGENCY.phone,
      agency_email: AGENCY.email,
      agency_website: AGENCY.website,
      date: toIsoDate(),
      document_place: 'Gdynia',
      document_status: 'draft',
      client_name: '',
      client_address: '',
      client_phone: '',
      client_email: '',
      agent_name: '',
      property_address: '',
      property_type: '',
      property_area: '',
      property_rooms: '',
      property_price: '',
      property_market: '',
      property_legal_status: '',
      property_floor: '',
      property_building_type: '',
      property_land_area: '',
      document_terms: 'Prowizja agencji zgodnie z cennikiem i ustaleniami indywidualnymi.',
      document_notes: 'Brak uwag dodatkowych.',
    }),
    []
  );

  const propertyById = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p])), [properties]);
  const agentById = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a])), [agents]);

  useEffect(() => {
    if (!useAgencyFromSettings || !agencyFromSettings) return;
    const fullAddress = `${agencyFromSettings.address}, ${agencyFromSettings.zipCode} ${agencyFromSettings.city}`.trim();
    setFormData((prev) => ({
      ...prev,
      agency_name: agencyFromSettings.name || prev.agency_name || AGENCY.name,
      agency_nip: agencyFromSettings.nip || prev.agency_nip || AGENCY.nip,
      agency_address: fullAddress || prev.agency_address || AGENCY.address,
      agency_phone: agencyFromSettings.phone || prev.agency_phone || AGENCY.phone,
      agency_email: agencyFromSettings.email || prev.agency_email || AGENCY.email,
      agency_website: agencyFromSettings.website || prev.agency_website || AGENCY.website,
    }));
  }, [useAgencyFromSettings, agencyFromSettings]);

  const templateFromQuery = useMemo(() => {
    const raw = (searchParams.get('template') || '').toUpperCase();
    return raw in TEMPLATES ? (raw as TemplateKey) : null;
  }, [searchParams]);

  const clientNameFromDocs = useCallback((clientId: string) => {
    const doc = documents.find((d) => d.clientId === clientId && d.title.includes(' - '));
    if (!doc) return `Klient #${clientId}`;
    const parts = doc.title.split(' - ');
    return parts[1] || `Klient #${clientId}`;
  }, [documents]);

  const applyPrefillFromStore = useCallback(() => {
    const updates: Record<string, string> = {};

    if (selectedClientId) {
      const client = clients.find((c) => c.id === selectedClientId);
      if (client) {
        updates.client_name = clientNameFromDocs(client.id);
        updates.client_address = client.preferences?.locations?.[0] || '';
        updates.client_phone = '';
        updates.client_email = '';
      }
    }

    if (selectedPropertyId && propertyById[selectedPropertyId]) {
      const p = propertyById[selectedPropertyId];
      updates.property_address = `${p.address.street || ''} ${p.address.buildingNumber || ''}, ${p.address.city || ''}`.trim();
      updates.property_type = p.propertyType || '';
      updates.property_area = p.area ? `${p.area}` : '';
      updates.property_rooms = p.rooms ? `${p.rooms}` : '';
      updates.property_price = p.price ? `${p.price}` : '';
      updates.property_market = p.marketType || '';
      updates.property_legal_status = p.ownershipStatus || '';
      updates.property_floor = p.floors?.current !== undefined ? `${p.floors.current}` : '';
      updates.property_building_type = p.buildingType || '';
      updates.property_land_area = p.plotArea ? `${p.plotArea}` : '';
    }

    if (selectedAgentId && agentById[selectedAgentId]) {
      const a = agentById[selectedAgentId];
      updates.agent_name = `Agent #${a.id}`;
    }

    setFormData((prev) => ({ ...prev, ...updates }));
  }, [selectedClientId, selectedPropertyId, selectedAgentId, clients, propertyById, agentById, clientNameFromDocs]);

  useEffect(() => {
    if (!selectedTemplate && templateFromQuery) {
      setSelectedTemplate(templateFromQuery);
    }

    const clientId = searchParams.get('clientId') || '';
    const propertyId = searchParams.get('propertyId') || '';
    const agentId = searchParams.get('agentId') || '';
    const transactionId = searchParams.get('transactionId') || '';

    if (clientId && !selectedClientId) setSelectedClientId(clientId);
    if (propertyId && !selectedPropertyId) setSelectedPropertyId(propertyId);
    if (agentId && !selectedAgentId) setSelectedAgentId(agentId);
    if (transactionId && !selectedTransactionId) setSelectedTransactionId(transactionId);
  }, [searchParams, templateFromQuery, selectedTemplate, selectedClientId, selectedPropertyId, selectedAgentId, selectedTransactionId]);

  useEffect(() => {
    if (!selectedTemplate || isUrlPrefillApplied) return;
    const hasUrlPrefill = Boolean(searchParams.get('clientId') || searchParams.get('propertyId') || searchParams.get('agentId'));
    if (!hasUrlPrefill) return;
    applyPrefillFromStore();
    setIsUrlPrefillApplied(true);
  }, [selectedTemplate, isUrlPrefillApplied, searchParams, applyPrefillFromStore]);

  useEffect(() => {
    if (!template || meta || isBootstrappingDocument || bootstrapLockRef.current) return;
    let cancelled = false;

    const bootstrapDocument = async () => {
      bootstrapLockRef.current = true;
      setIsBootstrappingDocument(true);
      try {
        const documentKey = selectedDocumentKey || getDocumentKeyByTemplate(template.code);
        const definition = documentDefinitions.find((item) => item.key === documentKey);

        const numberPayload = await apiFetch<{ documentNumber: string }>('/documents/number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId: currentAgencyId,
          documentType: documentKey,
          type: getLegacyTypeByDocumentKey(documentKey),
          templateKey: template.code,
        }),
      });

      const selectedClient = clients.find((c) => c.id === selectedClientId);
      const selectedProperty = propertyById[selectedPropertyId];
      const selectedAgent = agentById[selectedAgentId];

      setMeta((prev) => prev ?? {
        id: `local-${Date.now()}`,
        number: numberPayload.documentNumber,
        version: 1,
        status: (formData.document_status as LocalStatus) || 'draft',
      });

      const payloadSnapshot = mapDocumentPayload({
        client: selectedClient,
        property: selectedProperty,
        agent: selectedAgent,
        agency: AGENCY,
        base: {
          ...defaultContext,
          ...formData,
        },
      });

      const missingFields = findMissingRequiredFields(payloadSnapshot, definition?.requiredFields || []);
      const nextStatus = (formData.document_status as LocalStatus) || 'draft';
      const nextTitle = formData.document_title || definition?.name || template.title;
      const nextHash = hashString(`${numberPayload.documentNumber}:${template.code}:v1:${nextStatus}`);

      if (missingFields.length > 0) {
        setValidationError(`Brak wymaganych pol: ${missingFields.join(', ')}`);
        setMeta({
          id: `local-${Date.now()}`,
          number: numberPayload.documentNumber,
          version: 1,
          status: nextStatus,
        });
        return;
      }

      setValidationError('');

      try {
        const result = await createDocumentWithVersion({
          document: {
            agencyId: currentAgencyId,
            documentNumber: numberPayload.documentNumber,
            type: TEMPLATE_TO_DOCUMENT_TYPE[template.code],
            documentType: documentKey,
            status: toDocumentStatus(nextStatus),
            category: definition?.category,
            templateKey: template.code,
            templateVersion: definition?.templateVersion || 1,
            outputFormat: definition?.outputFormat || 'pdf',
            transactionId: selectedTransactionId || undefined,
            clientId: selectedClientId || undefined,
            propertyId: selectedPropertyId || undefined,
            agentId: selectedAgentId || undefined,
            title: nextTitle,
            content: '',
            metadata: {
              source: 'pdf-generator',
              template: template.code,
            },
            generatedPayloadSnapshot: payloadSnapshot,
          },
          version: {
            agencyId: currentAgencyId,
            documentNumber: numberPayload.documentNumber,
            documentType: documentKey,
            title: nextTitle,
            version: 1,
            status: toDocumentStatus(nextStatus),
            hash: nextHash,
            note: 'Initial version',
          },
        });

        if (cancelled) return;
        setMeta({
          id: result.document.id,
          number: result.document.documentNumber,
          version: 1,
          status: nextStatus,
        });
        } catch (error) {
          if (cancelled) return;
          // Fallback: allow preview/download even when API rejects draft persistence.
          setMeta({
            id: `local-${Date.now()}`,
            number: numberPayload.documentNumber,
            version: 1,
            status: nextStatus,
          });
          const msg = error instanceof Error ? error.message : 'Nie udało się zapisać szkicu dokumentu w API.';
          setValidationError(msg);
        }
      } finally {
        if (!cancelled) setIsBootstrappingDocument(false);
        bootstrapLockRef.current = false;
      }
    };

    void bootstrapDocument();
    return () => {
      cancelled = true;
    };
  }, [
    agentById,
    clients,
    createDocumentWithVersion,
    currentAgencyId,
    defaultContext,
    documentDefinitions,
    formData,
    isBootstrappingDocument,
    meta,
    propertyById,
    selectedAgentId,
    selectedClientId,
    selectedPropertyId,
    selectedTransactionId,
    template,
    selectedDocumentKey,
  ]);


  useEffect(() => {
    if (!selectedDocumentKey && selectedTemplate && documentDefinitions.length > 0) {
      const fallback = documentDefinitions.find((d) => d.templateKey === selectedTemplate)
      if (fallback) setSelectedDocumentKey(fallback.key)
    }
  }, [selectedDocumentKey, selectedTemplate, documentDefinitions]);

  const context = useMemo(() => {
    if (!template || !meta) return null;
    const selectedClient = clients.find((c) => c.id === selectedClientId);
    const selectedProperty = propertyById[selectedPropertyId];
    const selectedAgent = agentById[selectedAgentId];
    const mapped = mapDocumentPayload({
      client: selectedClient,
      property: selectedProperty,
      agent: selectedAgent,
      agency: AGENCY,
      base: {
        ...defaultContext,
        ...formData,
      },
    });
    const merged = {
      ...mapped,
      document_title: formData.document_title || template.title,
      document_number: formData.document_number || meta.number,
      document_id: meta.id,
      document_status: formData.document_status || meta.status,
      document_version: `v${meta.version}`,
    };
    const hashSource = JSON.stringify({ ...merged, template: template.code });
    return { ...merged, document_hash: hashString(hashSource) };
  }, [template, meta, clients, selectedClientId, propertyById, selectedPropertyId, agentById, selectedAgentId, defaultContext, formData]);

  useEffect(() => {
    if (!context) {
      setQrDataUrl('');
      return;
    }
    const payload = JSON.stringify({
      id: context.document_id,
      number: context.document_number,
      hash: context.document_hash,
      status: context.document_status,
      version: context.document_version,
    });
    QRCode.toDataURL(payload, { width: 100, margin: 0 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [context]);

  const renderedHtml = useMemo(() => {
    if (!context || !template) return '';
    const body = buildDocumentBody(context, template.code);
    return buildHtml({ ...context, qr_code_image: qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" />` : '' }, body);
  }, [context, template, qrDataUrl]);

  const selectedDefinition = useMemo(() => {
    if (selectedDocumentKey) {
      return documentDefinitions.find((item) => item.key === selectedDocumentKey) || null;
    }
    if (!template) return null;
    const documentKey = getDocumentKeyByTemplate(template.code);
    return documentDefinitions.find((item) => item.key === documentKey) || null;
  }, [documentDefinitions, template, selectedDocumentKey]);

  const missingRequiredFields = useMemo(() => {
    if (!context || !selectedDefinition) return [];
    return findMissingRequiredFields(context, selectedDefinition.requiredFields || []);
  }, [context, selectedDefinition]);

  const versionHistory = meta ? getDocumentVersions(meta.id) : [];

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'document_status' && meta && template) {
      const nextMeta = { ...meta, status: value as LocalStatus };
      setMeta(nextMeta);
      const hash = hashString(`${nextMeta.id}:${nextMeta.number}:${nextMeta.version}:${nextMeta.status}`);
      void updateDocumentWithVersion({
        documentId: nextMeta.id,
        documentPatch: {
          status: toDocumentStatus(nextMeta.status),
          title: formData.document_title || selectedDefinition?.name || template.title,
        },
        version: {
          agencyId: currentAgencyId,
          documentNumber: nextMeta.number,
          documentType: TEMPLATE_TO_DOCUMENT_TYPE[template.code],
          title: formData.document_title || selectedDefinition?.name || template.title,
          version: nextMeta.version,
          status: toDocumentStatus(nextMeta.status),
          hash,
          note: `Status changed to ${value}`,
        },
      });
    }
  };

  const bumpVersion = () => {
    if (!meta || !template) return;
    const nextMeta = { ...meta, version: meta.version + 1 };
    setMeta(nextMeta);
    const hash = hashString(`${nextMeta.id}:${nextMeta.number}:${nextMeta.version}:${nextMeta.status}`);
    void updateDocumentWithVersion({
      documentId: nextMeta.id,
      documentPatch: {
        title: formData.document_title || template.title,
      },
      version: {
        agencyId: currentAgencyId,
        documentNumber: nextMeta.number,
        documentType: TEMPLATE_TO_DOCUMENT_TYPE[template.code],
        title: formData.document_title || template.title,
        version: nextMeta.version,
        status: toDocumentStatus(nextMeta.status),
        hash,
        note: 'Manual version bump',
      },
    });
  };

  const handlePrint = () => {
    if (!renderedHtml) {
      setValidationError('Brak treści dokumentu do podglądu/wydruku. Uzupełnij pola i wybierz szablon.')
      return
    }
    setValidationError('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(renderedHtml);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  };

  const getStoredToken = () => {
    try {
      const raw = window.localStorage.getItem('mwpanel-auth')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.state?.token || null
    } catch {
      return null
    }
  }

  const handleDownload = async () => {
    if (!template) return;
    if (!renderedHtml) {
      setValidationError('Brak treści dokumentu do pobrania. Uzupełnij pola i wybierz szablon.')
      return
    }
    setValidationError('');
    try {
      const token = getStoredToken()
      const fileNameBase = `${template.code}_${new Date().getFullYear()}_${Date.now()}`
      const response = await fetch('/api/documents/render-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ html: renderedHtml, fileName: fileNameBase }),
      })
      if (!response.ok) {
        let message = `Błąd generowania PDF (${response.status})`
        const contentType = response.headers.get('content-type') || ''
        if (contentType.toLowerCase().includes('application/json')) {
          const payload = await response.json() as { error?: { message?: string } }
          if (payload?.error?.message) {
            message = payload.error.message
          }
        }
        throw new Error(message)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileNameBase}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Nie udało się wygenerować PDF')
    }
  }


  const getInputType = (field: string) => {
    if (field === 'date') return 'date';
    if (field.includes('price') || field.includes('area') || field.includes('rooms') || field.includes('floor')) return 'number';
    return 'text';
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">Tryb zaawansowany generatora</p>
          <p className="text-xs text-gray-500 mt-1">Podstawowy workflow dokumentowy jest teraz w Document Hub.</p>
        </div>
        <Link to="/dokumenty" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
          Wroc do Dokumentow
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Generator Dokumentow</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Jeden profesjonalny template PDF dla wszystkich dokumentow CRM</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ContextHelpButton help={getContextHelp('/generator')} />
          {template && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setPreview((p) => !p)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Eye size={16} />
                {preview ? 'Form' : 'Preview'}
              </button>
              <button onClick={bumpVersion} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                + Version
              </button>
              <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                <Printer size={16} /> Print
              </button>
              <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Download size={16} /> Download PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {template && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="mb-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Typ dokumentu (pełna lista) <InlineFieldHelp text="Wybierz właściwy typ dokumentu biznesowego. Lista obejmuje wszystkie aktywne definicje dostępne w systemie i pozwala dopasować szablon do procesu sprzedaży." /></label>
            <select
              title="Typ dokumentu"
              value={selectedDocumentKey}
              onChange={(e) => {
                const key = e.target.value
                setSelectedDocumentKey(key)
                const def = documentDefinitions.find((d) => d.key === key)
                if (def && def.templateKey in TEMPLATES) {
                  setSelectedTemplate(def.templateKey as TemplateKey)
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
            >
              <option value="">Wybierz typ dokumentu...</option>
              {documentDefinitions
                .filter((d) => d.enabled)
                .map((d) => (
                  <option key={d.key} value={d.key}>{d.category} • {d.name}</option>
                ))}
            </select>
          </div>

          <label className="mb-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={useAgencyFromSettings}
              onChange={(e) => setUseAgencyFromSettings(e.target.checked)}
              className="h-4 w-4"
            />
            użyj danych agencji z ustawień systemu <InlineFieldHelp text="Po włączeniu generator pobiera dane agencji z ustawień systemowych zamiast ręcznie wpisanych wartości, co ułatwia zachowanie spójności dokumentów." />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select title="Select client" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientNameFromDocs(c.id)}</option>)}
            </select>
            <select title="Select property" value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{`${p.address.city} - ${p.address.street}`}</option>)}
            </select>
            <select title="Select agent" value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
              <option value="">Select agent</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{`Agent #${a.id}`}</option>)}
            </select>
            <button onClick={() => applyPrefillFromStore()} className="px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors">Autofill from CRM</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {(Object.entries(TEMPLATES) as Array<[TemplateKey, TemplateConfig]>).map(([key, tmpl]) => (
          <button
            key={key}
            onClick={() => {
              setSelectedTemplate(key);
              setMeta(null);
              setFormData({});
              setIsUrlPrefillApplied(false);
              setPreview(false);
              const def = documentDefinitions.find((d) => d.templateKey === key);
              setSelectedDocumentKey(def?.key || '');
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectedTemplate === key
                ? `${BORDER_MAP[tmpl.color]} ${COLOR_MAP[tmpl.color]}`
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <FileText size={18} className={selectedTemplate === key ? '' : 'text-gray-400'} />
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${COLOR_MAP[tmpl.color]}`}>{tmpl.code}</span>
            </div>
            <p className={`text-sm font-semibold ${selectedTemplate === key ? '' : 'text-gray-700 dark:text-gray-300'}`}>{tmpl.label}</p>
          </button>
        ))}
      </div>

      {!template && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-16 text-center">
          <FileText size={48} className="text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Choose document type</h3>
          <p className="text-gray-500 dark:text-gray-400">Every document is generated from base_document.html.</p>
        </div>
      )}

      {validationError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {validationError}
        </div>
      )}

      {template && !preview && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className={`px-3 py-1 rounded-full text-sm font-bold border ${COLOR_MAP[template.color]}`}>{template.code}</div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">{selectedDefinition?.name || template.title}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Workflow status</label>
              <select
                title="Workflow status"
                value={formData.document_status || meta?.status || 'draft'}
                onChange={(e) => handleChange('document_status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                <span className="text-gray-500 dark:text-gray-300">ID</span>
                <p className="font-mono text-xs mt-1 break-all">{meta?.id || '-'}</p>
              </div>
              <div className="text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                <span className="text-gray-500 dark:text-gray-300">Version</span>
                <p className="font-semibold mt-1">v{meta?.version || 1}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CORE_FIELDS.map((field) => {
              if (field === 'document_status') return null;
              const wide = field.includes('terms') || field.includes('notes') || field.includes('address');
              return (
                <div key={field} className={wide ? 'md:col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{FIELD_LABELS[field]}</label>
                  {field.includes('terms') || field.includes('notes') ? (
                    <textarea
                      rows={3}
                      title={FIELD_LABELS[field]}
                      placeholder={FIELD_LABELS[field]}
                      value={formData[field] ?? defaultContext[field] ?? ''}
                      onChange={(e) => handleChange(field, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    />
                  ) : (
                    <input
                      type={getInputType(field)}
                      title={FIELD_LABELS[field]}
                      placeholder={FIELD_LABELS[field]}
                      value={formData[field] ?? defaultContext[field] ?? ''}
                      onChange={(e) => handleChange(field, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => {
                if (!renderedHtml) {
                  setValidationError('Brak treści dokumentu do podglądu. Uzupełnij formularz i spróbuj ponownie.')
                  return
                }
                setValidationError('')
                setPreview(true)
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Eye size={16} /> Preview document
            </button>
            <button onClick={() => { setFormData({}); setSelectedTemplate(null); }} className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium">
              Clear
            </button>
          </div>
        </div>
      )}

      {template && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Typ dokumentu (pełna lista)</label>
            <select
              title="Typ dokumentu"
              value={selectedDocumentKey}
              onChange={(e) => {
                const key = e.target.value
                setSelectedDocumentKey(key)
                const def = documentDefinitions.find((d) => d.key === key)
                if (def && def.templateKey in TEMPLATES) {
                  setSelectedTemplate(def.templateKey as TemplateKey)
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
            >
              <option value="">Wybierz typ dokumentu...</option>
              {documentDefinitions
                .filter((d) => d.enabled)
                .map((d) => (
                  <option key={d.key} value={d.key}>{d.category} • {d.name}</option>
                ))}
            </select>
          </div>

          <h3 className="font-semibold text-gray-800 dark:text-white mb-3">Version history</h3>
          {versionHistory.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No entries yet.</p>
          ) : (
            <div className="space-y-2">
              {versionHistory.map((entry) => (
                <div key={entry.id} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-white">v{entry.version} - {entry.status}</p>
                    <p className="text-gray-500 dark:text-gray-400">{entry.note || 'No note'}</p>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <p className="font-mono">{entry.hash}</p>
                    <p>{new Date(entry.createdAt).toLocaleString('pl-PL')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {template && preview && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Eye size={18} className="text-blue-600" />
              <span className="font-semibold text-gray-800 dark:text-white">Document preview</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${COLOR_MAP[template.color]}`}>{template.label}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(false)} className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                Back to form
              </button>
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                <Printer size={14} /> Print
              </button>
              <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Download size={14} /> Download
              </button>
            </div>
          </div>
          <div className="overflow-auto bg-gray-100 dark:bg-gray-900 p-6">
            {renderedHtml ? (
              <iframe title="Document preview" srcDoc={renderedHtml} className="w-full max-w-[900px] min-h-[1180px] bg-white shadow-lg mx-auto" />
            ) : (
              <div className="w-full max-w-[900px] min-h-[280px] bg-white shadow-lg mx-auto flex items-center justify-center text-sm text-gray-600 p-6 text-center">
                Brak treści podglądu. Wybierz typ dokumentu i uzupełnij wymagane pola.
              </div>
            )}
          </div>
        </div>
      )}

      {!template && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Hash, title: 'Document hash', desc: 'Each revision is stored with a hash.', color: 'blue' },
            { icon: User, title: 'Workflow statuses', desc: 'Statuses: draft, sent, signed, archived.', color: 'green' },
            { icon: Building2, title: 'Single template', desc: 'All docs are generated from base_document.html.', color: 'purple' },
          ].map((item) => (
            <div key={item.title} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${item.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' : item.color === 'green' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                <item.icon size={20} className={item.color === 'blue' ? 'text-blue-600' : item.color === 'green' ? 'text-green-600' : 'text-purple-600'} />
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-white mb-1">{item.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
