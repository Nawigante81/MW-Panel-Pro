import { chromium } from '@playwright/test';

const email = `pdf.${Date.now()}@mwpanel.pl`;
const password = 'Haslo12345!';
await fetch('http://127.0.0.1:8787/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, firstName: 'Pdf', lastName: 'Test' }),
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('response', async (r) => {
  const u=r.url();
  if (u.includes('/api/documents') || u.includes('/api/document-definitions')) {
    console.log('RESP', r.status(), u);
  }
});
page.on('console', m => console.log('CONSOLE', m.type(), m.text()));
page.on('pageerror', e => console.log('PAGEERROR', e.message));

await page.goto('http://127.0.0.1:4173/login');
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
await page.goto('http://127.0.0.1:4173/generator');
await page.waitForTimeout(1000);
await page.click('button:has-text("UP")');
await page.waitForTimeout(2000);
const txt = await page.content();
console.log('HAS_VALID_ERR', txt.includes('Nie mozna'));
await browser.close();
