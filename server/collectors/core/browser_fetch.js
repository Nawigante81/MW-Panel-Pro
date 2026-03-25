export const fetchHtmlWithBrowser = async (url, { timeoutMs = 20000, userAgent } = {}) => {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(1500);
    const html = await page.content();
    await page.close();
    return html;
  } finally {
    await context.close();
    await browser.close();
  }
};
