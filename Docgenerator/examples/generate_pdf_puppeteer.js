const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

const BASE = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(BASE, 'templates', 'base_document.html');
const OUT_PATH = path.join(BASE, 'example-output.pdf');

const createBody = (ctx) => `
<div class="section break-inside-avoid">
  <div class="section-title">Strony umowy</div>
  <table class="two-col">
    <tr>
      <td>
        <div class="soft-box">
          <h4>Klient</h4>
          <table class="data-table">
            <tr><td class="label">Imi� i nazwisko</td><td>${ctx.client_name}</td></tr>
            <tr><td class="label">Adres</td><td>${ctx.client_address}</td></tr>
            <tr><td class="label">Telefon</td><td>${ctx.client_phone}</td></tr>
            <tr><td class="label">Email</td><td>${ctx.client_email}</td></tr>
          </table>
        </div>
      </td>
      <td>
        <div class="soft-box">
          <h4>Agencja</h4>
          <table class="data-table">
            <tr><td class="label">Nazwa</td><td>${ctx.agency_name}</td></tr>
            <tr><td class="label">Adres</td><td>${ctx.agency_address}</td></tr>
            <tr><td class="label">Telefon</td><td>${ctx.agency_phone}</td></tr>
            <tr><td class="label">Email</td><td>${ctx.agency_email}</td></tr>
            <tr><td class="label">Agent</td><td>${ctx.agent_name}</td></tr>
          </table>
        </div>
      </td>
    </tr>
  </table>
</div>

<div class="section break-inside-avoid">
  <div class="section-title">Parametry nieruchomo�ci</div>
  <table class="property-grid">
    <tr><td class="head">Adres</td><td>${ctx.property_address}</td><td class="head">Typ</td><td>${ctx.property_type}</td></tr>
    <tr><td class="head">Powierzchnia</td><td>${ctx.property_area}</td><td class="head">Pokoje</td><td>${ctx.property_rooms}</td></tr>
    <tr><td class="head">Cena</td><td>${ctx.property_price}</td><td class="head">Rynek</td><td>${ctx.property_market}</td></tr>
  </table>
</div>

<div class="section break-inside-avoid">
  <div class="section-title">Tre�� umowy</div>
  <div class="terms">
    <p><b>�1 Strony umowy.</b> Umow� zawieraj� strony wskazane powy�ej.</p>
    <p><b>�2 Przedmiot umowy.</b> Umowa dotyczy nieruchomo�ci przy ${ctx.property_address}.</p>
    <p><b>�3 Zakres czynno�ci.</b> Agencja prowadzi czynno�ci po�rednictwa i obs�ugi transakcji.</p>
    <p><b>�4 Wynagrodzenie.</b> Wynagrodzenie agencji zgodnie z ustaleniami: ${ctx.document_terms}.</p>
    <p><b>�5 Czas trwania.</b> Umowa obowi�zuje od ${ctx.date} do realizacji celu umowy.</p>
    <p><b>�6 Postanowienia ko�cowe.</b> Uwagi ko�cowe: ${ctx.document_notes}.</p>
  </div>
</div>

<table class="signatures break-inside-avoid">
  <tr>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Klient</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Agent</div></td>
    <td><div class="sign-space"></div><div class="sign-line"></div><div class="sign-label">Agencja</div></td>
  </tr>
</table>
`;

(async () => {
  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const context = {
    agency_name: 'MW Partner Michał Walenkiewicz Partnership',
    agency_nip: '615-19-45-090',
    agency_address: 'ul. 10 Lutego 16, 81-364 Gdynia',
    agency_phone: '+48 516 949 612',
    agency_email: 'kontakt@mwpartner.pl',
    document_title: 'Umowa po�rednictwa w obrocie nieruchomo�ciami',
    document_number: 'UP/2026/0001',
    date: '2026-03-11',
    document_place: 'Zgorzelec',
    document_status: 'draft',
    document_id: crypto.randomUUID(),
    document_version: 'v1',
    client_name: 'Jan Kowalski',
    client_address: 'ul. Kwiatowa 2, 59-900 Zgorzelec',
    client_phone: '+48 500 111 222',
    client_email: 'jan@example.com',
    agent_name: 'Anna Nowak',
    property_address: 'ul. S�oneczna 11, Zgorzelec',
    property_type: 'Mieszkanie',
    property_area: '63 m2',
    property_rooms: '3',
    property_price: '650 000 PLN',
    property_market: 'Wt�rny',
    document_terms: 'Prowizja 2.5% + VAT',
    document_notes: 'Bez dodatkowych zastrze�e�',
  };

  context.document_body = createBody(context);
  context.document_hash = crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex').slice(0, 16);

  const qrPayload = JSON.stringify({
    id: context.document_id,
    number: context.document_number,
    hash: context.document_hash,
    status: context.document_status,
    version: context.document_version,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 100, margin: 0 });
  context.qr_code_image = `<img src="${qrDataUrl}" alt="QR" />`;

  let finalHtml = templateHtml;
  for (const [key, value] of Object.entries(context)) {
    finalHtml = finalHtml.replaceAll(`{{${key}}}`, String(value));
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(finalHtml, { waitUntil: 'networkidle0' });
  await page.pdf({ path: OUT_PATH, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  await browser.close();

  console.log(`Wygenerowano: ${OUT_PATH}`);
})();
