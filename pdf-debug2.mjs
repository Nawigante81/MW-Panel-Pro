import { chromium } from '@playwright/test';
const email = `pdf2.${Date.now()}@mwpanel.pl`;
const password = 'Haslo12345!';
await fetch('http://127.0.0.1:8787/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,firstName:'Pdf',lastName:'Two'})});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({acceptDownloads:true});
await page.goto('http://127.0.0.1:4173/login');
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
await page.goto('http://127.0.0.1:4173/generator');
await page.waitForTimeout(1000);
await page.click('button:has-text("UP")');
await page.waitForTimeout(1500);
await page.click('button:has-text("Preview document")');
await page.waitForTimeout(800);
const srcdoc = await page.locator('iframe[title="Document preview"]').getAttribute('srcdoc');
console.log('SRCDOC_LEN', srcdoc?.length || 0);
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 5000 }).catch(()=>null),
  page.locator('button:has-text("Download")').first().click()
]);
console.log('DOWNLOAD_EVENT', !!download);
await browser.close();
