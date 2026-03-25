import { useState } from 'react';
import { useSendEmail } from '@/hooks/useSendEmail';

export function SendEmailExample() {
  const { send, loading, success, error } = useSendEmail();
  const [email, setEmail] = useState('');

  return (
    <div className="space-y-2">
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="klient@example.com"
        className="border rounded px-3 py-2 text-sm"
      />
      <button
        disabled={loading}
        onClick={() =>
          send({
            templateCode: 'document_send',
            to: { email },
            variables: {
              client_name: 'Jan Kowalski',
              agent_name: 'Anna Nowak',
              agent_email: 'anna@mwpanel.pl',
              document_title: 'Umowa pośrednictwa #2026/03/17',
            },
            relatedEntityType: 'document',
            relatedEntityId: '00000000-0000-0000-0000-000000000000',
          })
        }
        className="bg-blue-600 text-white rounded px-3 py-2 text-sm disabled:opacity-60"
      >
        {loading ? 'Kolejkowanie...' : 'Wyślij email'}
      </button>

      {success && <p className="text-xs text-green-600">Zakolejkowano: {success.id}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
