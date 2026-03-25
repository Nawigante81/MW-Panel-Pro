# Email queue (Resend) - MWPanel

## Wymagane sekrety

Ustaw w Supabase Functions Secrets:

- `RESEND_API_KEY`
- `EMAIL_FROM` (np. `admin@mwpanel.pl`)
- `EMAIL_ATTACHMENTS_BUCKET` (opcjonalnie, domyślnie `documents`)
- `PROCESS_EMAIL_QUEUE_TOKEN` (zalecane w produkcji; wymagany Bearer token przy invoke queue processora)

## Deploy

```bash
supabase db push
supabase functions deploy enqueue-email
supabase functions deploy process-email-queue
```

## Przetwarzanie kolejki

Ręcznie:

```bash
supabase functions invoke process-email-queue --body '{"limit":20}'
```

Docelowo: podpiąć Supabase Cron / zewnętrzny scheduler co 1-2 minuty.
