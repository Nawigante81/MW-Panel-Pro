import { chromium } from '@playwright/test';

const email = `mapdev.${Date.now()}@mwpanel.pl`;
const password = 'Haslo12345!';
await fetch('http://127.0.0.1:8787/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, firstName: 'Map', lastName: 'Dev' }),
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGEERROR', err.stack || err.message));
page.on('requestfailed', req => console.log('REQFAILED', req.url(), req.failure()?.errorText));

await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
await page.goto('http://127.0.0.1:5173/mapa', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/home/acid/v5/map-debug-dev.png', fullPage: true });
console.log('URL', page.url());
await browser.close();
