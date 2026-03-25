const baseUrl = process.env.HEALTHCHECK_URL || 'http://localhost:8787/api/health';
const token = process.env.API_TOKEN || 'mwpanel-dev-token';

const run = async () => {
  const response = await fetch(baseUrl, {
    headers: {
      'x-api-token': token,
    },
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    const message = payload?.error?.message || `Healthcheck failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  console.log('Healthcheck OK');
  console.log(JSON.stringify(payload.data, null, 2));
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
