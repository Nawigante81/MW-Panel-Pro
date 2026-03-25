import { useEffect, useState } from 'react';
import { Mail, MessageSquare, Plus, Search, Copy, Edit3, Trash2, Send, Eye, Tag, Clock, User, Building2, Check, X, ChevronDown, Star, Zap } from 'lucide-react';
import { useSendEmail } from '@/hooks/useSendEmail';

type TemplateType = 'email' | 'sms';
type TemplateCategory = 'all' | 'lead' | 'client' | 'property' | 'followup' | 'transaction';

interface Template {
  id: string;
  type: TemplateType;
  category: TemplateCategory;
  name: string;
  subject?: string;
  body: string;
  tags: string[];
  usageCount: number;
  isFavorite: boolean;
  createdAt: string;
}

const INITIAL_TEMPLATES: Template[] = [
  {
    id: '1', type: 'email', category: 'lead', name: 'Powitanie nowego leada',
    subject: 'Dziękujemy za kontakt – {{agency_name}}',
    body: `Szanowny/a {{client_name}},

Dziękujemy za kontakt z naszą agencją nieruchomości {{agency_name}}.

Twoje zapytanie zostało przyjęte. Nasz agent {{agent_name}} skontaktuje się z Tobą w ciągu 24 godzin roboczych.

W razie pilnych pytań, możesz skontaktować się bezpośrednio:
📞 {{agent_phone}}
✉️ {{agent_email}}

Z poważaniem,
{{agent_name}}
{{agency_name}}`,
    tags: ['lead', 'powitanie', 'auto'], usageCount: 47, isFavorite: true, createdAt: '2025-01-15'
  },
  {
    id: '2', type: 'email', category: 'property', name: 'Prezentacja nieruchomości',
    subject: 'Oferta nieruchomości: {{property_title}} – {{property_price}} PLN',
    body: `Szanowny/a {{client_name}},

W nawiązaniu do naszej rozmowy, przesyłam szczegółową ofertę nieruchomości, która może Cię zainteresować:

🏠 **{{property_title}}**
📍 {{property_address}}
💰 Cena: {{property_price}} PLN
📐 Powierzchnia: {{property_area}} m²
🏢 Liczba pokoi: {{property_rooms}}

**Opis:**
{{property_description}}

Zapraszam na prezentację – proszę o potwierdzenie terminu:
📅 Proponowany termin: {{presentation_date}}

Z chęcią odpowiem na wszelkie pytania.

Pozdrawiam serdecznie,
{{agent_name}}
Tel: {{agent_phone}}`,
    tags: ['oferta', 'prezentacja', 'nieruchomość'], usageCount: 132, isFavorite: true, createdAt: '2025-01-10'
  },
  {
    id: '3', type: 'email', category: 'followup', name: 'Follow-up po prezentacji',
    subject: 'Jak wrażenia po prezentacji {{property_title}}?',
    body: `Szanowny/a {{client_name}},

Dziękuję za poświęcony czas podczas wczorajszej prezentacji nieruchomości przy {{property_address}}.

Chciałem/am zapytać o Twoje wrażenia i ewentualne pytania, które nasunęły się po wizycie.

Jeśli nieruchomość przypadła Ci do gustu, możemy omówić:
✅ Warunki finansowe i możliwość negocjacji ceny
✅ Szczegóły prawne i stan techniczny
✅ Harmonogram dalszych kroków

Czekam na Twoją odpowiedź!

Pozdrawiam,
{{agent_name}}
{{agent_phone}}`,
    tags: ['follow-up', 'prezentacja', 'po wizycie'], usageCount: 89, isFavorite: false, createdAt: '2025-01-12'
  },
  {
    id: '4', type: 'email', category: 'transaction', name: 'Potwierdzenie rezerwacji',
    subject: 'Potwierdzenie rezerwacji – {{property_title}}',
    body: `Szanowny/a {{client_name}},

Z przyjemnością potwierdzam rezerwację nieruchomości:

🏠 {{property_title}}
📍 {{property_address}}
💰 Cena: {{property_price}} PLN
📅 Data rezerwacji: {{reservation_date}}
⏰ Ważność rezerwacji: {{reservation_expiry}}

Kolejne kroki:
1. Podpisanie umowy przedwstępnej do: {{contract_date}}
2. Wpłata zadatku: {{deposit_amount}} PLN
3. Akt notarialny: {{notary_date}}

W razie pytań pozostaję do dyspozycji.

Z poważaniem,
{{agent_name}}
{{agency_name}}
Tel: {{agent_phone}}`,
    tags: ['rezerwacja', 'transakcja', 'potwierdzenie'], usageCount: 34, isFavorite: true, createdAt: '2025-01-08'
  },
  {
    id: '5', type: 'sms', category: 'lead', name: 'SMS – Nowy lead',
    body: `Cześć {{client_name}}! Dziękujemy za kontakt z {{agency_name}}. Agent {{agent_name}} odezwie się wkrótce. Pytania? {{agent_phone}}`,
    tags: ['sms', 'lead', 'auto'], usageCount: 203, isFavorite: true, createdAt: '2025-01-05'
  },
  {
    id: '6', type: 'sms', category: 'followup', name: 'SMS – Przypomnienie o prezentacji',
    body: `Cześć {{client_name}}! Przypominam o jutrzejszej prezentacji {{property_title}} o godz. {{presentation_time}} pod adresem {{property_address}}. Do zobaczenia! {{agent_name}} {{agent_phone}}`,
    tags: ['sms', 'przypomnienie', 'prezentacja'], usageCount: 156, isFavorite: false, createdAt: '2025-01-03'
  },
  {
    id: '7', type: 'sms', category: 'followup', name: 'SMS – Follow-up 3 dni',
    body: `Cześć {{client_name}}! Jak wrażenia po prezentacji? Mam jeszcze kilka ciekawych ofert w Twoim budżecie. Zadzwoń: {{agent_phone}}. {{agent_name}}, {{agency_name}}`,
    tags: ['sms', 'follow-up'], usageCount: 78, isFavorite: false, createdAt: '2025-01-06'
  },
  {
    id: '8', type: 'email', category: 'client', name: 'Życzenia urodzinowe',
    subject: 'Wszystkiego najlepszego, {{client_name}}! 🎂',
    body: `Szanowny/a {{client_name}},

Z okazji urodzin przesyłam najserdeczniejsze życzenia zdrowia, szczęścia i spełnienia wszystkich marzeń!

Mam nadzieję, że realizacja Twoich planów mieszkaniowych przebiega pomyślnie.

Jeśli w przyszłości będziesz potrzebować pomocy przy zakupie, sprzedaży lub wynajmie nieruchomości – zawsze chętnie pomogę!

Z serdecznymi pozdrowieniami,
{{agent_name}}
{{agency_name}}`,
    tags: ['relacja', 'urodziny', 'klient'], usageCount: 22, isFavorite: false, createdAt: '2025-01-14'
  },
];

const FIELDS = [
  { group: 'Klient', fields: ['{{client_name}}', '{{client_phone}}', '{{client_email}}'] },
  { group: 'Agent', fields: ['{{agent_name}}', '{{agent_phone}}', '{{agent_email}}'] },
  { group: 'Agencja', fields: ['{{agency_name}}', '{{agency_address}}', '{{agency_phone}}'] },
  { group: 'Nieruchomość', fields: ['{{property_title}}', '{{property_address}}', '{{property_price}}', '{{property_area}}', '{{property_rooms}}', '{{property_description}}'] },
  { group: 'Transakcja', fields: ['{{reservation_date}}', '{{contract_date}}', '{{deposit_amount}}', '{{notary_date}}'] },
  { group: 'Termin', fields: ['{{presentation_date}}', '{{presentation_time}}', '{{reservation_expiry}}'] },
];

const CATEGORIES = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'lead', label: 'Leady' },
  { id: 'client', label: 'Klienci' },
  { id: 'property', label: 'Oferty' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'transaction', label: 'Transakcje' },
];

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<Template[]>(INITIAL_TEMPLATES);
  const [activeType, setActiveType] = useState<'all' | TemplateType>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const { send, loading: sendingEmail, error: sendError, success: sendSuccess, deliveryStatus, recentStatuses, refreshStatuses } = useSendEmail();

  const filtered = templates.filter(t => {
    if (activeType !== 'all' && t.type !== activeType) return false;
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase()) && !t.body.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleCopy = (template: Template) => {
    navigator.clipboard.writeText(template.body);
    setCopiedId(template.id);
    setTimeout(() => setCopiedId(null), 2000);
    setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, usageCount: t.usageCount + 1 } : t));
  };

  const handleFavorite = (id: string) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, isFavorite: !t.isFavorite } : t));
  };

  const handleDelete = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (selectedTemplate?.id === id) setSelectedTemplate(null);
  };

  const handleEdit = (template: Template) => {
    setEditTemplate({ ...template });
    setEditMode(true);
  };

  const handleSaveEdit = () => {
    if (!editTemplate) return;
    setTemplates(prev => prev.map(t => t.id === editTemplate.id ? editTemplate : t));
    if (selectedTemplate?.id === editTemplate.id) setSelectedTemplate(editTemplate);
    setEditMode(false);
    setEditTemplate(null);
  };

  const insertField = (field: string) => {
    if (!editTemplate) return;
    const textarea = document.getElementById('template-body') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = editTemplate.body.substring(0, start) + field + editTemplate.body.substring(end);
      setEditTemplate({ ...editTemplate, body: newBody });
    }
  };

  useEffect(() => {
    if (!showSendModal) return;

    void refreshStatuses().catch(() => {});
    const intervalId = window.setInterval(() => {
      void refreshStatuses().catch(() => {});
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [showSendModal, refreshStatuses]);

  const previewBody = selectedTemplate?.body
    .replace(/{{client_name}}/g, 'Jan Kowalski')
    .replace(/{{agent_name}}/g, 'Piotr Nowak')
    .replace(/{{agent_phone}}/g, '600 100 200')
    .replace(/{{agent_email}}/g, 'piotr@mwpanel.pl')
    .replace(/{{agency_name}}/g, 'MWPanel Nieruchomości')
    .replace(/{{property_title}}/g, 'Mieszkanie 3-pok. Mokotów')
    .replace(/{{property_address}}/g, 'ul. Puławska 45, Warszawa')
    .replace(/{{property_price}}/g, '850 000')
    .replace(/{{property_area}}/g, '65')
    .replace(/{{property_rooms}}/g, '3')
    .replace(/{{presentation_date}}/g, '15.06.2025 godz. 14:00')
    .replace(/{{presentation_time}}/g, '14:00')
    .replace(/{{reservation_date}}/g, '10.06.2025')
    .replace(/{{reservation_expiry}}/g, '24.06.2025')
    .replace(/{{contract_date}}/g, '01.07.2025')
    .replace(/{{deposit_amount}}/g, '50 000')
    .replace(/{{notary_date}}/g, '15.08.2025') || '';

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Mail className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            Szablony Email i SMS
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Gotowe szablony do komunikacji z klientami</p>
        </div>
        <button
          onClick={() => {
            const newTemplate: Template = { id: Date.now().toString(), type: 'email', category: 'lead', name: 'Nowy szablon', subject: '', body: '', tags: [], usageCount: 0, isFavorite: false, createdAt: new Date().toISOString().split('T')[0] };
            setTemplates(prev => [newTemplate, ...prev]);
            handleEdit(newTemplate);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Nowy szablon
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Szablony email', value: templates.filter(t => t.type === 'email').length, icon: Mail, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Szablony SMS', value: templates.filter(t => t.type === 'sms').length, icon: MessageSquare, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Ulubione', value: templates.filter(t => t.isFavorite).length, icon: Star, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Łącznie użyć', value: templates.reduce((s, t) => s + t.usageCount, 0), icon: Zap, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Left Panel - Template List */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Szukaj szablonu..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2">
              {['all', 'email', 'sms'].map(type => (
                <button key={type} onClick={() => setActiveType(type as 'all' | TemplateType)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeType === type ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                  {type === 'email' && <Mail className="w-3.5 h-3.5" />}
                  {type === 'sms' && <MessageSquare className="w-3.5 h-3.5" />}
                  {type === 'all' ? 'Wszystkie' : type.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${activeCategory === cat.id ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template Cards */}
          <div className="space-y-3">
            {filtered.map(template => (
              <div
                key={template.id}
                onClick={() => { setSelectedTemplate(template); setPreviewMode(false); }}
                className={`bg-white dark:bg-gray-800 rounded-xl border transition-all cursor-pointer hover:shadow-md ${selectedTemplate?.id === template.id ? 'border-blue-400 dark:border-blue-600 shadow-md' : 'border-gray-100 dark:border-gray-700'}`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${template.type === 'email' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                        {template.type === 'email' ? <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{template.name}</h3>
                        {template.subject && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Temat: {template.subject}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={e => { e.stopPropagation(); handleFavorite(template.id); }}
                        title="Dodaj do ulubionych"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${template.isFavorite ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'}`}>
                        <Star className="w-3.5 h-3.5" fill={template.isFavorite ? 'currentColor' : 'none'} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleCopy(template); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        {copiedId === template.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleEdit(template); }}
                        title="Edytuj szablon"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(template.id); }}
                        title="Usuń szablon"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{template.body.replace(/\n/g, ' ')}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {template.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Clock className="w-3 h-3" />
                      Użyto: {template.usageCount}x
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Brak szablonów pasujących do filtrów</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Preview / Edit */}
        {(selectedTemplate || editMode) && (
          <div className="w-96 shrink-0">
            {editMode && editTemplate ? (
              /* EDIT MODE */
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden sticky top-4">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 dark:text-white">Edytuj szablon</h3>
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                      <Check className="w-3.5 h-3.5" /> Zapisz
                    </button>
                    <button onClick={() => { setEditMode(false); setEditTemplate(null); }} title="Zamknij" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div>
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Nazwa szablonu</label>
                    <input value={editTemplate.name} onChange={e => setEditTemplate({ ...editTemplate, name: e.target.value })}
                      title="Nazwa szablonu"
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Typ</label>
                      <select value={editTemplate.type} onChange={e => setEditTemplate({ ...editTemplate, type: e.target.value as TemplateType })}
                        title="Typ"
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Kategoria</label>
                      <select value={editTemplate.category} onChange={e => setEditTemplate({ ...editTemplate, category: e.target.value as TemplateCategory })}
                        title="Kategoria"
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {editTemplate.type === 'email' && (
                    <div>
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Temat wiadomości</label>
                      <input value={editTemplate.subject || ''} onChange={e => setEditTemplate({ ...editTemplate, subject: e.target.value })}
                        title="Temat wiadomości"
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Treść szablonu</label>
                    <textarea
                      id="template-body"
                      value={editTemplate.body}
                      onChange={e => setEditTemplate({ ...editTemplate, body: e.target.value })}
                      rows={8}
                      title="Treść szablonu"
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                    />
                  </div>

                  {/* Field inserter */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-2">Wstaw zmienną</label>
                    <div className="space-y-2">
                      {FIELDS.map(group => (
                        <div key={group.group}>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{group.group}</p>
                          <div className="flex flex-wrap gap-1">
                            {group.fields.map(field => (
                              <button key={field} onClick={() => insertField(field)}
                                className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-mono">
                                {field}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedTemplate ? (
              /* PREVIEW MODE */
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden sticky top-4">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${selectedTemplate.type === 'email' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                        {selectedTemplate.type === 'email' ? <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />}
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white text-sm">{selectedTemplate.name}</span>
                    </div>
                    <button onClick={() => setSelectedTemplate(null)} title="Zamknij podgląd" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setPreviewMode(!previewMode)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${previewMode ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                      <Eye className="w-3.5 h-3.5" /> {previewMode ? 'Kod' : 'Podgląd'}
                    </button>
                    <button onClick={() => handleCopy(selectedTemplate)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                      {copiedId === selectedTemplate.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      Kopiuj
                    </button>
                    <button onClick={() => setShowSendModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors ml-auto">
                      <Send className="w-3.5 h-3.5" /> Wyślij
                    </button>
                  </div>
                </div>

                <div className="p-4 max-h-[60vh] overflow-y-auto">
                  {selectedTemplate.subject && (
                    <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Temat:</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {previewMode ? selectedTemplate.subject.replace(/{{client_name}}/g, 'Jan Kowalski').replace(/{{agency_name}}/g, 'MWPanel Nieruchomości').replace(/{{property_title}}/g, 'Mieszkanie 3-pok. Mokotów').replace(/{{property_price}}/g, '850 000') : selectedTemplate.subject}
                      </p>
                    </div>
                  )}

                  <div className={`text-sm whitespace-pre-wrap ${previewMode ? 'text-gray-800 dark:text-gray-200' : 'text-gray-700 dark:text-gray-300 font-mono text-xs'}`}>
                    {previewMode ? previewBody : selectedTemplate.body}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Send Modal */}
      {showSendModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">Wyślij wiadomość</h3>
              <button onClick={() => setShowSendModal(false)} title="Zamknij" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                  {selectedTemplate.type === 'email' ? 'Adres email odbiorcy' : 'Numer telefonu'}
                </label>
                <input value={sendTo} onChange={e => setSendTo(e.target.value)}
                  placeholder={selectedTemplate.type === 'email' ? 'klient@example.com' : '+48 600 100 200'}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {selectedTemplate.type === 'email' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Temat</label>
                  <input value={sendSubject || selectedTemplate.subject || ''} onChange={e => setSendSubject(e.target.value)}
                    title="Temat wiadomości"
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Podgląd treści</label>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                  {previewBody}
                </div>
              </div>
              {deliveryStatus && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-600 dark:text-gray-300">Status wysyłki</span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold ${
                        deliveryStatus.status === 'sent'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : deliveryStatus.status === 'failed'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : deliveryStatus.status === 'sending'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}
                    >
                      {deliveryStatus.status === 'sending' && <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />}
                      {deliveryStatus.status === 'queued' && 'Oczekuje'}
                      {deliveryStatus.status === 'sending' && 'Wysyłanie'}
                      {deliveryStatus.status === 'sent' && 'Wysłano'}
                      {deliveryStatus.status === 'failed' && 'Błąd'}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    ID: {deliveryStatus.id}
                    {deliveryStatus.sentAt ? ` • wysłano: ${new Date(deliveryStatus.sentAt).toLocaleTimeString('pl-PL')}` : ''}
                  </div>
                  {deliveryStatus.errorMessage && (
                    <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">{deliveryStatus.errorMessage}</div>
                  )}
                </div>
              )}
              {recentStatuses.length > 0 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-2.5 text-xs">
                  <p className="text-gray-600 dark:text-gray-300 mb-1">Ostatnie wysyłki</p>
                  <div className="space-y-1">
                    {recentStatuses.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-gray-500 dark:text-gray-400">{item.toEmail}</span>
                        <span className={`shrink-0 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded ${item.status === 'sent' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : item.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : item.status === 'sending' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                          {item.status === 'sending' && <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />}
                          {item.status === 'queued' && 'Oczekuje'}
                          {item.status === 'sending' && 'Wysyłanie'}
                          {item.status === 'sent' && 'Wysłano'}
                          {item.status === 'failed' && 'Błąd'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sendError && <p className="text-xs text-red-600 dark:text-red-400">{sendError}</p>}
              {sendSuccess && <p className="text-xs text-green-600 dark:text-green-400">Zakolejkowano email: {sendSuccess.id}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSendModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Anuluj
                </button>
                <button
                  onClick={async () => {
                    try {
                      if (selectedTemplate.type !== 'email') {
                        alert('SMS nie jest jeszcze podpięty do backendu.');
                        return;
                      }

                      await send({
                        to: { email: sendTo },
                        subject: sendSubject || selectedTemplate.subject || 'Wiadomość z MWPanel',
                        html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${previewBody}</pre>`,
                        text: previewBody,
                      });
                    } catch {
                      // Błąd jest obsługiwany przez useSendEmail (sendError).
                    }
                  }}
                  disabled={sendingEmail}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" />
                  {sendingEmail ? 'Wysyłanie...' : `Wyślij ${selectedTemplate.type.toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
