# Faza 1 - Audit systemu (2026-03-16)

## Zakres

Audit calego repo pod katem:

- mock data
- martwych akcji UI
- niepelnych flow UI->API->DB
- funkcji czesciowo wdrozonych
- testow API zawieszajacych sie

## Stan ogolny

- API: dziala (health OK)
- Front: dziala po build/restart
- Endpointy API: 87
- Najwiekszy dlug: moduly z mockami + UI z akcjami bez handlerow

## Moduly - status

### Dziala produkcyjnie (lub blisko)

- Properties (lista, tworzenie nowego wpisu, import z URL)
- Leads (lista, dodawanie, usuwanie)
- Documents + PDF Generator (statusy, wersjonowanie, generowanie)
- Monitoring / import zewnetrznych ofert (core)

### Czesciowo

- PropertyDetail (edycja tylko czesci pol listingu)
- Admin (mix: czesc realna, czesc placeholder)
- UserProfile (czesc zmian lokalnie, nie wszystko persystowane)
- Reports (duzo statycznych danych)
- FileUpload (UI dziala, backend storage brak)

### Mock / niedokonczone

- Agents (hardcoded)
- ClientDetail (mock, nie uzywa realnego ID)
- ActivityFeed (static mock dataset)
- PortalPublish (placeholder)

## Martwe klikane elementy (przyklady krytyczne)

- Clients: Dodaj klienta / Edytuj / Wiecej / pseudo-paginacja
- Agents: Dodaj / Edytuj / Wiecej
- ClientDetail: Edytuj, czesc akcji dokumentow
- FileUpload: Podglad/Pobierz bez realnego storage flow
- Login: "Zapomniales hasla?" bez flow
- Admin/BusinessSuite: czesc przyciskow konfiguracyjnych placeholder

## Integracje danych

- Wiele ekranow uzywa poprawnie `useDataStore + apiFetch`
- Czesc ekranow dalej oparta na lokalnych tablicach/mockach
- Nierowny standard obslugi loading/error

## Testy API

- Czesc testow przechodzi
- Czesc testow zawiesza sie (pending promise / brak cleanup async)
- Wymaga stabilizacji lifecycle testow (teardown, domykanie watcherow/schedulerow)

## Priorytety refaktoru

### P0 (krytyczne UX/wiarygodnosc)

1. Clients: pelny CRUD + realne akcje + paginacja backendowa
2. ClientDetail: realny odczyt po ID + realne akcje
3. Agents: przepiecie z mock na API CRUD
4. Dead actions: usunac/wylaczyc wszystkie puste klikane elementy
5. FileUpload: realny upload + metadata + download endpoint

### P1 (stabilnosc i spojnosc)

1. ActivityFeed na backend
2. Reports na realne metryki API
3. UserProfile: pelna persystencja zmian
4. PropertyDetail: pelna edycja property + listing
5. Documents download fallback przez API gdy brak `fileUrl/pdfUrl`

### P2 (jakosc danych i admin)

1. Normalizacja importu (rooms/price null)
2. Admin: ukrycie/disable placeholderow bez backendu
3. PortalPublish: wdrozenie lub pelne ukrycie

## Zasady wdrozenia (Phase 2)

- Brak fake backend logic
- Brak martwych przyciskow
- Kazdy klik mapuje do realnego flow albo jest wylaczony
- Reuse istniejacej architektury (`apiFetch`, store, obecne endpointy)

## Plan wykonawczy - 2 sprinty

### Sprint 1 (P0 - krytyczne UX i wiarygodnosc)

Cel sprintu:

- usunac martwe akcje z kluczowych moduow
- domknac najwazniejsze flow CRM end-to-end

Zakres (kolejnosc realizacji):

1. Clients - pelny CRUD + paginacja backendowa
2. ClientDetail - odczyt po realnym ID + realne akcje
3. Agents - przepiecie z hardcoded na API CRUD
4. FileUpload - realny upload + metadata + download endpoint
5. Dead actions cleanup - disable/usuniecie wszystkich pustych klikow

Deliverables:

- wszystkie przyciski w Clients, Agents, ClientDetail dzialaja lub sa jawnie disabled
- FileUpload zapisuje plik i pozwala go pobrac
- paginacja po stronie backendu dziala i jest podpieta w UI

Akceptacja (DoD sprintu):

- brak pustych akcji w zakresie sprintu
- kazdy ekran ma loading/error/empty state
- testy API dla nowych endpointow przechodza
- test smoke UI: create -> edit -> list -> detail -> delete

Ryzyka i bufor:

- ryzyko: niespojne modele danych clients/agents
- mitigacja: najpierw stabilizacja kontraktu API (request/response)
- bufor: 20 procent pojemnosci sprintu na bugfix po integracji

### Sprint 2 (P1 - stabilnosc, spojnosc i metryki)

Cel sprintu:

- usunac remaining mocki z kluczowych modulow
- ujednolicic zachowanie frontu i API

Zakres (kolejnosc realizacji):

1. ActivityFeed - przejscie na backend
2. Reports - realne metryki z API
3. UserProfile - pelna persystencja zmian
4. PropertyDetail - pelna edycja property + listing
5. Documents - fallback download przez API
6. Stabilizacja testow API (teardown, domykanie schedulerow/watcherow)

Deliverables:

- brak statycznych datasetow w ActivityFeed i Reports
- UserProfile i PropertyDetail zapisuja oraz odczytuja dane po API
- testy API nie wisza i maja stabilny teardown

Akceptacja (DoD sprintu):

- wszystkie flow z zakresu sprintu maja test integracyjny API
- brak nieobsluzonych promise i timeoutow w testach
- raporty i feed pokazuja dane rzeczywiste

## Backlog po 2 sprintach (P2)

1. Normalizacja importu (rooms/price null)
2. Admin - ukrycie albo wdrozenie placeholderow
3. PortalPublish - wdrozenie lub calkowite ukrycie

## Metryki postepu (na oba sprinty)

- liczba martwych akcji: cel 0 w obszarze sprintu
- procent ekranow bez mock data: cel 100 procent dla zakresu sprintu
- stabilnosc testow API: cel 100 procent green na CI
- liczba regresji po wdrozeniu: cel <= 2 na sprint

## Sprint 1 - checklista techniczna (plik -> endpoint -> done)

### A. Clients i ClientDetail

Pliki frontend:

- src/components/Clients.tsx
- src/components/ClientDetail.tsx
- src/store/dataStore.ts
- src/utils/apiClient.ts

Plik backend:

- server/index.js

Endpointy do domkniecia i przetestowania:

- GET /api/clients/list
- GET /api/clients
- POST /api/clients
- PATCH /api/clients/:id
- DELETE /api/clients/:id
- POST /api/clients/import

Taski techniczne:

1. Ujednolicic parametry i mapowanie pol miedzy Clients.tsx i ClientDetail.tsx.
2. Wprowadzic jednolity model loading/error/empty dla obu ekranow.
3. Upewnic sie, ze edycja w ClientDetail odswieza dane listy po zapisie.
4. Dodac guardy na null i brakujace pola (notes, source, status, type).
5. Zweryfikowac, ze wszystkie akcje UI maja endpoint albo sa disabled z opisem.

Kryteria done:

- create, edit, delete klienta dziala z poziomu UI
- po zapisie dane sa widoczne bez recznego refresh
- brak martwych przyciskow w Clients i ClientDetail

### B. Agents

Pliki frontend:

- src/components/Agents.tsx
- src/store/dataStore.ts

Plik backend:

- server/index.js

Endpointy do domkniecia i przetestowania:

- GET /api/agents
- POST /api/agents
- PATCH /api/agents/:id
- DELETE /api/agents/:id

Taski techniczne:

1. Ujednolicic walidacje formularza i payload dla create/edit agenta.
2. Zweryfikowac mapowanie stats i fallback dla pustych wartosci.
3. Dodac twarde komunikaty bledow dla 4xx i 5xx.
4. Dopic test smoke CRUD dla agenta.

Kryteria done:

- CRUD agenta dziala end-to-end
- brak hardcoded danych agentow w UI
- poprawny refresh listy po create/edit/delete

### C. FileUpload (upload i download)

Pliki frontend:

- src/components/FileUpload.tsx

Plik backend:

- server/index.js

Endpointy do domkniecia i przetestowania:

- GET /api/file-assets
- POST /api/file-assets/upload
- GET /api/file-assets/:id/download
- DELETE /api/file-assets/:id

Taski techniczne:

1. Zweryfikowac limity rozmiaru i typy plikow po stronie backendu.
2. Dodac jednoznaczne komunikaty dla blednych mime i zbyt duzych plikow.
3. Upewnic sie, ze download dziala dla nowo wrzuconych plikow.
4. Dopic cleanup po delete (rekord + plik fizyczny).
5. Dopic test smoke upload -> list -> download -> delete.

Kryteria done:

- plik po uploadzie jest widoczny na liscie
- link download zwraca poprawny plik
- delete usuwa rekord i zasob bez osieroconych wpisow

### D. Dead Actions Cleanup

Pliki frontend do przejscia:

- src/components/Clients.tsx
- src/components/ClientDetail.tsx
- src/components/Agents.tsx
- src/components/FileUpload.tsx

Taski techniczne:

1. Przejsc wszystkie buttony i menu akcji w zakresie Sprintu 1.
1. Kazdej akcji przypisac endpoint i handler albo stan disabled z etykieta "W przygotowaniu".
1. Usunac puste onClick i placeholder callback.

Kryteria done:

- zero martwych klikow w zakresie Sprintu 1
- UX nie sugeruje funkcji, ktora nie dziala

## Kolejnosc realizacji (5 dni roboczych)

1. Dzien 1: Clients API + lista i paginacja
2. Dzien 2: ClientDetail + synchronizacja danych
3. Dzien 3: Agents CRUD + walidacje
4. Dzien 4: FileUpload upload/download/delete + cleanup
5. Dzien 5: Dead actions cleanup + smoke testy + poprawki regresji

## Gate przed zamknieciem Sprintu 1

- npm run build przechodzi
- brak bledow w src i server
- smoke scenariusze przechodza:
  - klient: create -> edit -> detail -> delete
  - agent: create -> edit -> delete
  - plik: upload -> list -> download -> delete

## Taskboard Jira (Epic -> Story -> Subtask)

### EPIC CRM-101 - Sprint 1 P0: Domkniecie flow CRM

Story CRM-111 - Clients CRUD i paginacja backendowa

- Subtask CRM-111-1: Ujednolicic model danych klienta w UI i API.
- Subtask CRM-111-2: Domknac create i edit w src/components/Clients.tsx.
- Subtask CRM-111-3: Domknac delete z odswiezeniem listy i komunikatami bledu.
- Subtask CRM-111-4: Potwierdzic paginacje GET /api/clients/list z filtrowaniem.
- Subtask CRM-111-5: Dodac smoke test create -> edit -> delete klienta.

Story CRM-112 - ClientDetail na realnym ID i realnych akcjach

- Subtask CRM-112-1: Potwierdzic ladowanie klienta po id w src/components/ClientDetail.tsx.
- Subtask CRM-112-2: Domknac zapisy status/type/notes i synchronizacje z lista.
- Subtask CRM-112-3: Ujednolicic loading/error/empty state.
- Subtask CRM-112-4: Usunac martwe akcje lub oznaczyc je jako disabled.
- Subtask CRM-112-5: Dodac smoke test detail -> edit -> save.

Story CRM-113 - Agents CRUD bez mock data

- Subtask CRM-113-1: Zweryfikowac payload create/edit w src/components/Agents.tsx.
- Subtask CRM-113-2: Potwierdzic endpointy GET/POST/PATCH/DELETE /api/agents.
- Subtask CRM-113-3: Dodac pelna obsluge bledow 4xx/5xx.
- Subtask CRM-113-4: Odswiezenie listy po create/edit/delete.
- Subtask CRM-113-5: Dodac smoke test CRUD agenta.

Story CRM-114 - FileUpload end-to-end

- Subtask CRM-114-1: Potwierdzic upload przez POST /api/file-assets/upload.
- Subtask CRM-114-2: Potwierdzic listowanie GET /api/file-assets.
- Subtask CRM-114-3: Potwierdzic download GET /api/file-assets/:id/download.
- Subtask CRM-114-4: Potwierdzic delete DELETE /api/file-assets/:id.
- Subtask CRM-114-5: Dopic cleanup fizycznego pliku i rekordu po delete.
- Subtask CRM-114-6: Dodac smoke test upload -> list -> download -> delete.

Story CRM-115 - Dead actions cleanup

- Subtask CRM-115-1: Przejrzec wszystkie akcje w Clients, ClientDetail, Agents, FileUpload.
- Subtask CRM-115-2: Kazdej akcji przypisac endpoint albo disabled + etykiete.
- Subtask CRM-115-3: Usunac puste onClick i placeholder callback.
- Subtask CRM-115-4: Finalny przeglad UX pod katem falszywych interakcji.

### EPIC CRM-201 - Sprint 2 P1: Stabilnosc i spojnosc

Story CRM-211 - ActivityFeed i Reports na danych backendowych

- Subtask CRM-211-1: Przepiac ActivityFeed z mock na API.
- Subtask CRM-211-2: Przepiac Reports z danych statycznych na API.
- Subtask CRM-211-3: Ujednolicic loading/error/empty state.

Story CRM-212 - UserProfile i PropertyDetail pelna persystencja

- Subtask CRM-212-1: Potwierdzic pelny zapis i odczyt UserProfile.
- Subtask CRM-212-2: Domknac pelna edycje PropertyDetail.
- Subtask CRM-212-3: Dopic fallback dokumentow przez API.

Story CRM-213 - Stabilizacja testow API

- Subtask CRM-213-1: Zidentyfikowac testy zawieszajace sie i zrodla pending promises.
- Subtask CRM-213-2: Dodac poprawny teardown i domykanie schedulerow/watcherow.
- Subtask CRM-213-3: Ustalic stabilne timeouty testowe i cleanup po suite.
- Subtask CRM-213-4: Potwierdzic 100 procent green run dla zakresu Sprintu 2.

## Definicja statusow Jira (proponowana)

- TODO: zadanie gotowe do startu.
- IN PROGRESS: aktywnie realizowane.
- BLOCKED: zablokowane zaleznoscia (wymaga ownera i daty unblock).
- IN REVIEW: po implementacji, przed merge.
- DONE: spelnia DoD i przeszlo smoke oraz build.
