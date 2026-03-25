# MWPanel – moduł dokumentów nieruchomości

Pakiet startowy do generowania dokumentów HTML/PDF dla MWPanel CRM.

## Zawartość

- `templates/base_document.html` – baza wspólna
- `templates/umowa_posrednictwa.html`
- `templates/protokol_prezentacji.html`
- `templates/karta_nieruchomosci.html`
- `templates/potwierdzenie_rezerwacji.html`
- `templates/zlecenie_poszukiwania.html`
- `examples/generate_pdf_weasyprint.py` – przykład Python
- `examples/generate_pdf_puppeteer.js` – przykład Node.js
- `fields-reference.md` – lista pól do podstawiania

## Jak tego używać

1. Wczytaj szablon HTML.
2. Podstaw zmienne `{{...}}` z danych z CRM.
3. Wygeneruj PDF przez WeasyPrint albo Puppeteer.
4. Zapisz dokument w archiwum dokumentów.

## Minimalny workflow w MWPanel

- Oferta / Klient / Lead
- Klik: **Generuj dokument**
- Backend pobiera szablon
- Podstawia dane
- Tworzy PDF
- Nadaje numer dokumentu
- Zapisuje rekord do tabeli `documents`
- Udostępnia pobieranie / podgląd / wysyłkę mailową

## Przykładowa tabela `documents`

```sql
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  document_number text not null unique,
  document_type text not null,
  status text not null default 'draft',
  client_id uuid,
  property_id uuid,
  agent_id uuid,
  html_content text,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Numeracja dokumentów – przykład

- `UP/2026/0001` – umowa pośrednictwa
- `PP/2026/0001` – protokół prezentacji
- `KN/2026/0001` – karta nieruchomości
- `PR/2026/0001` – potwierdzenie rezerwacji
- `ZP/2026/0001` – zlecenie poszukiwania

## Rekomendacja wdrożeniowa

Najpierw wdroż:
1. Umowa pośrednictwa
2. Protokół prezentacji
3. Karta nieruchomości
4. Rezerwacja
5. Zlecenie poszukiwania

Potem dołóż:
- podpis elektroniczny
- wersjonowanie dokumentów
- statusy draft/sent/signed/archived
- wysyłkę PDF mailem
- QR / kod weryfikacyjny dokumentu
