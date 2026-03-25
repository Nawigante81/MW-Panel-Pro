# External source production configs

Pliki:
- otodom.production.json
- olx.production.json
- gratka.production.json

## Ważne
To są **produkcyjne szablony** pod oficjalne API/feedy partnerskie.
Uzupełnij:
- endpointy (`apiUrl` / `feedUrl`)
- tokeny (`apiToken`)
- mapowanie (`mapping`) zgodnie z realnym payloadem dostawcy

## Wgranie configu przez API (PATCH)

1) Zaloguj i pobierz JWT
2) PATCH na źródło (src-otodom / src-olx / src-gratka)

Przykład (Otodom):

```bash
TOKEN="<JWT>"
BODY=$(cat config/external-sources/otodom.production.json)

curl -X PATCH http://127.0.0.1:8787/api/external-sources/src-otodom \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

Potem test importu:

```bash
curl -X POST http://127.0.0.1:8787/api/external-import/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Sugestia rolloutu
- najpierw 1 źródło na staging
- dopiero potem produkcja
- monitoruj: /api/external-import/jobs + /api/external-module/health
