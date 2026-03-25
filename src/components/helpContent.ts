import { Activity, BarChart3, BookOpen, Bot, Briefcase, Building2, CalendarDays, Calculator, CheckSquare, FileText, Globe, LayoutDashboard, Mail, MapPin, Search, Settings, Target, TrendingUp, Upload, User, Users } from 'lucide-react'

type IconType = typeof LayoutDashboard

export type HelpItem = {
  name: string
  path: string
  icon: IconType
  description: string
  businessUse: string
}

export type HelpSection = {
  title: string
  description: string
  items: HelpItem[]
}

export type QuickAction = {
  title: string
  description: string
  path: string
}

export type GuideStep = {
  title: string
  path: string
  steps: string[]
}

export type FAQItem = {
  question: string
  answer: string
}

export type ContextHelpEntry = {
  title: string
  intro: string
  bullets: string[]
  quickActions: QuickAction[]
  faqs: FAQItem[]
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Główne',
    description: 'Najważniejsze widoki do codziennej pracy, kontroli wyników i podejmowania szybkich decyzji.',
    items: [
      {
        name: 'Dashboard',
        path: '/',
        icon: LayoutDashboard,
        description: 'Centralny ekran operacyjny aplikacji. Pokazuje najważniejsze wskaźniki, zadania na dziś, wyjątki, follow-upy i szybkie przejścia do najczęściej używanych działań.',
        businessUse: 'Używaj na start dnia do ustalenia priorytetów, sprawdzenia co wymaga reakcji i szybkiego przejścia do pracy na leadach, zadaniach i ofertach.',
      },
      {
        name: 'Feed aktywności',
        path: '/feed',
        icon: Activity,
        description: 'Chronologiczny rejestr zmian w systemie — nowe oferty, aktualizacje rekordów, działania użytkowników i inne zdarzenia operacyjne.',
        businessUse: 'Przydaje się do kontroli pracy zespołu, weryfikacji ostatnich zmian oraz szybkiego sprawdzenia kto i kiedy wykonał dane działanie.',
      },
      {
        name: 'Raporty',
        path: '/raporty',
        icon: BarChart3,
        description: 'Moduł analityczny do przeglądu KPI, wyników agentów, statystyk ofert i zestawień wspierających decyzje zarządcze.',
        businessUse: 'Korzystaj do oceny skuteczności sprzedaży, porównania wyników zespołu oraz identyfikacji obszarów wymagających poprawy.',
      },
    ],
  },
  {
    title: 'CRM',
    description: 'Obszar do zarządzania relacjami z klientami, zapytaniami sprzedażowymi i pracą zespołu.',
    items: [
      {
        name: 'Klienci',
        path: '/klienci',
        icon: Users,
        description: 'Baza klientów z możliwością wyszukiwania, filtrowania i przeglądu szczegółów kontaktowych, statusów oraz notatek.',
        businessUse: 'To główne miejsce do utrzymania porządku w relacjach z klientami i szybkiego dostępu do historii współpracy.',
      },
      {
        name: 'Leady',
        path: '/leads',
        icon: Target,
        description: 'Obsługa nowych zapytań sprzedażowych i kontaktów wymagających kwalifikacji oraz dalszej pracy handlowej.',
        businessUse: 'Używaj do szybkiego przejmowania nowych szans sprzedażowych, planowania follow-upów i pilnowania, by żaden lead nie został bez reakcji.',
      },
      {
        name: 'Agenci',
        path: '/agenci',
        icon: Briefcase,
        description: 'Lista agentów z podglądem ich danych, aktywności i przypisań w systemie.',
        businessUse: 'Pomaga kontrolować podział pracy, monitorować aktywność zespołu i zarządzać odpowiedzialnością za klientów oraz oferty.',
      },
      {
        name: 'Pipeline',
        path: '/pipeline',
        icon: TrendingUp,
        description: 'Widok lejka sprzedażowego pokazujący sprawy na kolejnych etapach procesu handlowego.',
        businessUse: 'Korzystaj do oceny, gdzie blokują się procesy, które szanse są najbardziej perspektywiczne i jakie działania trzeba wykonać dalej.',
      },
    ],
  },
  {
    title: 'Oferty',
    description: 'Moduły do zarządzania portfelem nieruchomości, publikacją i monitoringiem rynku.',
    items: [
      {
        name: 'Nieruchomości',
        path: '/nieruchomosci',
        icon: Building2,
        description: 'Główna lista ofert CRM. Tutaj dodajesz, edytujesz i przeglądasz nieruchomości oraz kontrolujesz kompletność ich danych.',
        businessUse: 'To podstawowe miejsce pracy na ofercie — od wprowadzenia nieruchomości po przygotowanie jej do prezentacji i publikacji.',
      },
      {
        name: 'Mapa ofert',
        path: '/mapa',
        icon: MapPin,
        description: 'Widok mapowy prezentujący lokalizacje nieruchomości w czytelnej, przestrzennej formie.',
        businessUse: 'Przydatny przy analizie lokalizacji, porównywaniu położenia ofert oraz rozmowach z klientami o konkretnych obszarach.',
      },
      {
        name: 'Publikacja ofert',
        path: '/publikacja',
        icon: Globe,
        description: 'Moduł eksportu ofert do portali nieruchomości wraz z kontrolą gotowości publikacyjnej i stanu integracji.',
        businessUse: 'Używaj przed publikacją do sprawdzenia, czy oferta ma komplet danych i czy jest gotowa do wysyłki na zewnętrzne portale.',
      },
      {
        name: 'Monitoring',
        path: '/market',
        icon: Search,
        description: 'Podgląd ofert zewnętrznych, importów i danych rynkowych z monitorowanych źródeł.',
        businessUse: 'Pomaga śledzić konkurencję, analizować rynek i wychwytywać interesujące ogłoszenia, które warto porównać lub zaimportować do CRM.',
      },
    ],
  },
  {
    title: 'Narzędzia',
    description: 'Funkcje wspierające codzienną organizację pracy, komunikację i kalkulacje biznesowe.',
    items: [
      {
        name: 'Kalkulator',
        path: '/kalkulator',
        icon: Calculator,
        description: 'Narzędzie do wyliczeń finansowych związanych z zakupem, kredytem, opłacalnością inwestycji i porównaniem wariantów.',
        businessUse: 'Sprawdza się w pracy doradczej z klientem, przy analizie rentowności i podczas przygotowywania argumentów sprzedażowych.',
      },
      {
        name: 'Szablony Email/SMS',
        path: '/szablony',
        icon: Mail,
        description: 'Zestaw gotowych treści wiadomości, które przyspieszają komunikację z klientami i ujednolicają standard obsługi.',
        businessUse: 'Używaj do szybkiej wysyłki profesjonalnych komunikatów bez konieczności pisania każdej wiadomości od zera.',
      },
      {
        name: 'Rozszerzenia',
        path: '/rozszerzenia',
        icon: Bot,
        description: 'Pakiet dodatkowych funkcji biznesowych, m.in. narzędzi biurowych, AVM oraz modułów wspierających procesy agencyjne.',
        businessUse: 'To miejsce dla funkcji specjalistycznych, które rozszerzają standardowy CRM o dodatkowe możliwości operacyjne i analityczne.',
      },
      {
        name: 'Zadania',
        path: '/zadania',
        icon: CheckSquare,
        description: 'Lista zadań z podziałem na statusy i priorytety, wspierająca codzienną organizację pracy.',
        businessUse: 'Pomaga planować dzień, pilnować terminów i porządkować obowiązki zespołu lub pojedynczego agenta.',
      },
      {
        name: 'Kalendarz',
        path: '/kalendarz',
        icon: CalendarDays,
        description: 'Harmonogram spotkań, prezentacji, follow-upów i innych terminów istotnych dla pracy operacyjnej.',
        businessUse: 'Korzystaj do planowania dnia, synchronizacji działań handlowych oraz pilnowania terminów kontaktu z klientami.',
      },
    ],
  },
  {
    title: 'Dokumenty',
    description: 'Obszar odpowiedzialny za pliki, szablony i generowanie dokumentów sprzedażowych.',
    items: [
      {
        name: 'Dokumenty',
        path: '/dokumenty',
        icon: FileText,
        description: 'Repozytorium dokumentów CRM z możliwością filtrowania, podglądu oraz uruchamiania generowania nowych pozycji.',
        businessUse: 'Ułatwia utrzymanie porządku w dokumentacji klienta i nieruchomości oraz szybki dostęp do gotowych materiałów.',
      },
      {
        name: 'Generator (zaaw.)',
        path: '/generator',
        icon: BookOpen,
        description: 'Zaawansowany moduł tworzenia dokumentów na podstawie szablonów, np. kart nieruchomości, protokołów i umów.',
        businessUse: 'Używaj wszędzie tam, gdzie trzeba szybko przygotować profesjonalny dokument na podstawie danych zapisanych w systemie.',
      },
      {
        name: 'Pliki',
        path: '/pliki',
        icon: Upload,
        description: 'Miejsce do uploadu i zarządzania plikami powiązanymi z klientami, ofertami i dokumentami.',
        businessUse: 'Przydaje się do porządkowania załączników, zdjęć i materiałów potrzebnych w obsłudze oferty oraz klienta.',
      },
    ],
  },
  {
    title: 'System',
    description: 'Ustawienia użytkownika i obszar administracyjny aplikacji.',
    items: [
      {
        name: 'Mój profil',
        path: '/profil',
        icon: User,
        description: 'Edycja danych użytkownika, podstawowych ustawień konta i preferencji związanych z pracą w systemie.',
        businessUse: 'Tu aktualizujesz własne dane i dostosowujesz środowisko pracy do swoich potrzeb.',
      },
      {
        name: 'Admin',
        path: '/admin',
        icon: Settings,
        description: 'Panel konfiguracyjny przeznaczony dla administratora, obejmujący ustawienia agencji oraz parametry systemowe.',
        businessUse: 'Służy do zarządzania konfiguracją organizacji i utrzymania poprawnego działania aplikacji na poziomie administracyjnym.',
      },
    ],
  },
]

export const QUICK_ACTIONS: QuickAction[] = [
  { title: 'Dodaj nową nieruchomość', description: 'Przejdź od razu do formularza tworzenia nowej oferty i rozpocznij wprowadzanie danych.', path: '/nieruchomosci/nowa' },
  { title: 'Przejrzyj leady do obsługi', description: 'Otwórz moduł leadów i sprawdź nowe zapytania oraz kontakty wymagające follow-upu.', path: '/leads' },
  { title: 'Opublikuj gotowe oferty', description: 'Przejdź do publikacji, aby sprawdzić gotowość ofert i wysłać je na portale.', path: '/publikacja' },
  { title: 'Wygeneruj dokument', description: 'Otwórz generator dokumentów i przygotuj potrzebny formularz na podstawie danych z systemu.', path: '/generator' },
  { title: 'Sprawdź zadania na dziś', description: 'Przejdź do listy zadań, aby zobaczyć priorytety i obowiązki do wykonania.', path: '/zadania' },
  { title: 'Zobacz aktywność zespołu', description: 'Otwórz feed aktywności i skontroluj ostatnie działania w systemie.', path: '/feed' },
]

export const STEP_BY_STEP_GUIDES: GuideStep[] = [
  {
    title: 'Jak dodać nieruchomość',
    path: '/nieruchomosci/nowa',
    steps: [
      'Otwórz moduł Nieruchomości i wybierz dodanie nowej oferty.',
      'Uzupełnij podstawowe dane: typ, lokalizację, cenę, powierzchnię i status.',
      'Dodaj opis, zdjęcia oraz inne informacje potrzebne do prezentacji oferty.',
      'Zapisz rekord i sprawdź, czy oferta ma komplet danych wymaganych do dalszej pracy lub publikacji.',
    ],
  },
  {
    title: 'Jak opublikować ofertę',
    path: '/publikacja',
    steps: [
      'Przejdź do modułu Publikacja ofert.',
      'Sprawdź, czy oferta ma wymagane dane oraz czy integracje z portalami są aktywne.',
      'Wybierz docelowy portal lub kanał publikacji.',
      'Uruchom eksport i zweryfikuj status wysyłki po zakończeniu procesu.',
    ],
  },
  {
    title: 'Jak wygenerować dokument',
    path: '/generator',
    steps: [
      'Wejdź do Generatora (zaaw.).',
      'Wybierz odpowiedni typ dokumentu, np. kartę nieruchomości, protokół lub umowę.',
      'Powiąż dokument z właściwym klientem, ofertą lub innym rekordem.',
      'Sprawdź dane, uruchom generowanie i pobierz gotowy plik.',
    ],
  },
]

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'Od czego najlepiej zacząć pracę w aplikacji?',
    answer: 'Najlepiej zacząć od Dashboardu. To tam widać priorytety dnia, liczbę nowych leadów, zadania wymagające reakcji oraz wyjątki na ofertach.',
  },
  {
    question: 'Gdzie dodać nową nieruchomość?',
    answer: 'Nową ofertę dodasz w module Nieruchomości. Z tego widoku możesz przejść do formularza tworzenia nowej pozycji i uzupełnić dane potrzebne do dalszej obsługi lub publikacji.',
  },
  {
    question: 'Gdzie sprawdzić, czy oferta jest gotowa do publikacji?',
    answer: 'Do tego służy moduł Publikacja ofert. Tam sprawdzisz stan integracji, gotowość danych i uruchomisz eksport do portali zewnętrznych.',
  },
  {
    question: 'Gdzie wygenerować dokument dla klienta lub nieruchomości?',
    answer: 'Użyj Generatora (zaaw.) lub modułu Dokumenty. Generator służy do tworzenia dokumentów z szablonów, a Dokumenty pomagają nimi zarządzać.',
  },
  {
    question: 'Jak kontrolować, czy leady nie zostają bez reakcji?',
    answer: 'Najlepiej regularnie sprawdzać Dashboard, moduł Leady oraz Zadania. Te widoki razem pomagają pilnować follow-upów i terminów kontaktu.',
  },
  {
    question: 'Gdzie sprawdzić aktywność zespołu i zmiany w systemie?',
    answer: 'Skorzystaj z Feedu aktywności oraz Raportów. Feed pokazuje bieżące działania, a Raporty pomagają ocenić skuteczność pracy w szerszej perspektywie.',
  },
]

export const CONTEXT_HELP: Record<string, ContextHelpEntry> = {
  '/': {
    title: 'Pomoc: Dashboard',
    intro: 'Dashboard to ekran startowy do codziennego zarządzania pracą i priorytetami.',
    bullets: [
      'Sprawdzaj zadania na dziś i wyjątki wymagające reakcji.',
      'Kontroluj nowe leady i follow-upy bez przechodzenia przez wiele modułów.',
      'Traktuj ten ekran jako szybki panel dowodzenia na początek dnia.',
    ],
    quickActions: [
      { title: 'Otwórz leady', description: 'Przejdź do obsługi nowych zapytań.', path: '/leads' },
      { title: 'Otwórz zadania', description: 'Sprawdź listę zadań i terminów.', path: '/zadania' },
    ],
    faqs: FAQ_ITEMS.slice(0, 2),
  },
  '/nieruchomosci': {
    title: 'Pomoc: Nieruchomości',
    intro: 'Tutaj zarządzasz własnymi ofertami CRM i ich gotowością do dalszej pracy.',
    bullets: [
      'Dodawaj nowe oferty i pilnuj kompletności danych.',
      'Filtruj listę, aby szybciej znaleźć oferty wymagające działania.',
      'Z tego obszaru przechodzisz dalej do publikacji, dokumentów i szczegółów oferty.',
    ],
    quickActions: [
      { title: 'Dodaj nieruchomość', description: 'Przejdź do formularza nowej oferty.', path: '/nieruchomosci/nowa' },
      { title: 'Otwórz publikację', description: 'Sprawdź gotowość eksportu ofert.', path: '/publikacja' },
    ],
    faqs: [FAQ_ITEMS[1], FAQ_ITEMS[2]],
  },
  '/leads': {
    title: 'Pomoc: Leady',
    intro: 'Moduł leadów służy do przejmowania i prowadzenia nowych szans sprzedażowych.',
    bullets: [
      'Filtruj leady po statusie, by rozdzielić nowe, aktywne i wymagające follow-upu.',
      'Dbaj o regularną zmianę statusu, aby pipeline był wiarygodny.',
      'Łącz pracę w leadach z zadaniami i kalendarzem, by nie gubić terminów kontaktu.',
    ],
    quickActions: [
      { title: 'Otwórz zadania', description: 'Sprawdź działania do wykonania.', path: '/zadania' },
      { title: 'Przejdź do pipeline', description: 'Zobacz leady w szerszym procesie sprzedaży.', path: '/pipeline' },
    ],
    faqs: [FAQ_ITEMS[4]],
  },
  '/dokumenty': {
    title: 'Pomoc: Dokumenty',
    intro: 'Dokumenty pomagają utrzymać porządek w formalnej stronie procesu sprzedaży.',
    bullets: [
      'Przeglądaj dokumenty po statusie, typie i powiązaniu z klientem lub nieruchomością.',
      'Uruchamiaj generowanie nowych dokumentów bez wychodzenia z obszaru dokumentów.',
      'Korzystaj z generatora, jeśli potrzebujesz przygotować dokument na podstawie danych CRM.',
    ],
    quickActions: [
      { title: 'Otwórz generator', description: 'Przejdź do tworzenia dokumentów z szablonów.', path: '/generator' },
      { title: 'Otwórz pliki', description: 'Sprawdź załączniki i upload materiałów.', path: '/pliki' },
    ],
    faqs: [FAQ_ITEMS[3]],
  },
  '/raporty': {
    title: 'Pomoc: Raporty',
    intro: 'Raporty pozwalają ocenić wyniki i podejmować decyzje na podstawie danych.',
    bullets: [
      'Porównuj KPI w różnych okresach czasu.',
      'Analizuj aktywność agentów, strukturę ofert i skuteczność pracy na leadach.',
      'Używaj raportów do odpraw zespołu i przeglądów wyników.',
    ],
    quickActions: [
      { title: 'Otwórz feed aktywności', description: 'Sprawdź bieżące zdarzenia w systemie.', path: '/feed' },
      { title: 'Wróć do dashboardu', description: 'Przejdź do widoku operacyjnego.', path: '/' },
    ],
    faqs: [FAQ_ITEMS[5]],
  },
  '/zadania': {
    title: 'Pomoc: Zadania',
    intro: 'Zadania porządkują codzienną pracę i pomagają pilnować terminów.',
    bullets: [
      'Twórz zadania od razu, gdy pojawia się nowa sprawa do obsługi.',
      'Korzystaj z filtrów statusu i priorytetu, aby szybko ustalić kolejność działań.',
      'Traktuj zadania jako operacyjną listę wykonawczą dla siebie lub zespołu.',
    ],
    quickActions: [
      { title: 'Otwórz kalendarz', description: 'Zobacz terminy i spotkania.', path: '/kalendarz' },
      { title: 'Otwórz dashboard', description: 'Wróć do widoku dnia.', path: '/' },
    ],
    faqs: [FAQ_ITEMS[0], FAQ_ITEMS[4]],
  },
  '/klienci': {
    title: 'Pomoc: Klienci',
    intro: 'To główny widok pracy na bazie kontaktów i relacji z klientami.',
    bullets: [
      'Utrzymuj porządek w danych kontaktowych i statusach klientów.',
      'Korzystaj z filtrów, aby szybko oddzielić kupujących, sprzedających i leady.',
      'Traktuj kartę klienta jako centralne miejsce historii współpracy.',
    ],
    quickActions: [
      { title: 'Dodaj klienta', description: 'Przejdź do utworzenia nowego klienta.', path: '/klienci' },
      { title: 'Otwórz leady', description: 'Przejdź do zapytań sprzedażowych.', path: '/leads' },
    ],
    faqs: [FAQ_ITEMS[0]],
  },
  '/kalendarz': {
    title: 'Pomoc: Kalendarz',
    intro: 'Kalendarz pomaga planować prezentacje, spotkania i terminy follow-upów.',
    bullets: [
      'Planuj działania zespołu w układzie miesięcznym.',
      'Rejestruj prezentacje nieruchomości i spotkania z klientami.',
      'Używaj kalendarza razem z zadaniami, aby pilnować terminów operacyjnych.',
    ],
    quickActions: [
      { title: 'Otwórz zadania', description: 'Sprawdź zadania do wykonania.', path: '/zadania' },
      { title: 'Wróć do dashboardu', description: 'Przejdź do widoku dnia.', path: '/' },
    ],
    faqs: [FAQ_ITEMS[0]],
  },
  '/publikacja': {
    title: 'Pomoc: Publikacja ofert',
    intro: 'To miejsce do kontroli gotowości ofert i eksportu na portale zewnętrzne.',
    bullets: [
      'Sprawdzaj kompletność danych przed publikacją.',
      'Kontroluj status integracji z portalami.',
      'Uruchamiaj eksport dopiero po weryfikacji oferty i materiałów.',
    ],
    quickActions: [
      { title: 'Otwórz nieruchomości', description: 'Wróć do listy ofert CRM.', path: '/nieruchomosci' },
      { title: 'Otwórz monitoring', description: 'Porównaj rynek i ogłoszenia zewnętrzne.', path: '/market' },
    ],
    faqs: [FAQ_ITEMS[2]],
  },
  '/generator': {
    title: 'Pomoc: Generator dokumentów',
    intro: 'Generator pozwala szybko tworzyć dokumenty na podstawie danych CRM.',
    bullets: [
      'Dobierz właściwy szablon do etapu procesu sprzedaży.',
      'Sprawdź powiązanie z klientem, ofertą i innymi rekordami.',
      'Przed wydrukiem lub pobraniem zweryfikuj podgląd dokumentu.',
    ],
    quickActions: [
      { title: 'Otwórz dokumenty', description: 'Wróć do repozytorium dokumentów.', path: '/dokumenty' },
      { title: 'Otwórz pliki', description: 'Sprawdź załączniki i materiały.', path: '/pliki' },
    ],
    faqs: [FAQ_ITEMS[3]],
  },
  '/pipeline': {
    title: 'Pomoc: Pipeline',
    intro: 'Pipeline porządkuje transakcje według etapu i pokazuje przepływ procesu sprzedaży.',
    bullets: [
      'Przenoś sprawy między etapami zgodnie z faktycznym postępem.',
      'Kontroluj, gdzie proces się blokuje i które sprawy wymagają reakcji.',
      'Używaj pipeline razem z leadami i zadaniami, aby mieć pełen obraz pracy handlowej.',
    ],
    quickActions: [
      { title: 'Otwórz leady', description: 'Zobacz źródło nowych szans sprzedażowych.', path: '/leads' },
      { title: 'Wróć do dashboardu', description: 'Przejdź do widoku operacyjnego.', path: '/' },
    ],
    faqs: [FAQ_ITEMS[4]],
  },
  '/market': {
    title: 'Pomoc: Monitoring rynku',
    intro: 'Monitoring rynku pokazuje oferty zewnętrzne i pomaga obserwować konkurencję.',
    bullets: [
      'Śledź nowe ogłoszenia i zmiany na rynku.',
      'Porównuj ceny, statusy i lokalizacje ofert zewnętrznych.',
      'Wychwytuj interesujące pozycje do dalszej analizy lub importu.',
    ],
    quickActions: [
      { title: 'Otwórz publikację', description: 'Sprawdź eksport własnych ofert.', path: '/publikacja' },
      { title: 'Otwórz nieruchomości', description: 'Wróć do własnych ofert CRM.', path: '/nieruchomosci' },
    ],
    faqs: [FAQ_ITEMS[5]],
  },
}

export const getContextHelp = (pathname: string): ContextHelpEntry | null => {
  const direct = CONTEXT_HELP[pathname]
  if (direct) return direct

  const match = Object.entries(CONTEXT_HELP)
    .filter(([key]) => key !== '/' && pathname.startsWith(key))
    .sort((a, b) => b[0].length - a[0].length)[0]

  return match?.[1] || CONTEXT_HELP['/'] || null
}
