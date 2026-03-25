# MWPanel — cutover na PostgreSQL (all-in)

## 1) Przygotowanie env

W `.env`:

- `DB_DRIVER=postgres`
- `DATABASE_URL=postgres://...`
- `PG_SSLMODE=disable` (lub `require`)
- `RESEND_API_KEY=...`
- `EMAIL_FROM=admin@mwpanel.pl`

## 2) Utwórz schemat PG

Schemat tworzy się automatycznie przy starcie API (core + email).
Opcjonalnie uruchom SQL ręcznie: `server/sql/postgres_email_schema.sql`.

## 3) Migracja danych ze SQLite

```bash
npm run pg:migrate:core
```

Skrypt przenosi kluczowe tabele core + email.

## 4) Restart aplikacji

```bash
pm2 restart mwpanel-api --update-env
pm2 restart v5-web --update-env
```

## 5) Smoke testy

- `GET /api/health`
- logowanie
- listy klientów/ofert/dokumentów
- wysyłka `POST /api/emails/enqueue`
- procesor `POST /api/emails/process`

## 6) Cutover

Po potwierdzeniu poprawności:
- backup `data/mwpanel.sqlite`
- wyłączenie użycia SQLite (pozostawienie tylko awaryjnego backupu)
