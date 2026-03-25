import { chromium } from '@playwright/test';

const email = `maptest.${Date.now()}@mwpanel.pl`;
const password = 'Haslo12345!';

await fetch('http://127.0.0.1:8787/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, firstName: 'Map', lastName: 'Test' }),
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGEERROR', err.message));
page.on('requestfailed', req => console.log('REQFAILED', req.url(), req.failure()?.errorText));

await page.goto('http://127.0.0.1:4173/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL('**/', { timeout: 10000 });
await page.goto('http://127.0.0.1:4173/mapa', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/home/acid/v5/map-debug.png', fullPage: true });
console.log('URL', page.url());
const bodyText = await page.locator('body').innerText();
console.log('BODY_SNIP', bodyText.slice(0,300).replace(/\n/g,' | '));
await browser.close();
