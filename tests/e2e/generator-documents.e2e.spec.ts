import { test, expect } from '@playwright/test';

test.describe('Generator -> Documents -> Status/Version flow', () => {
  test('creates document in generator and advances status with versioning', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[type="email"]').fill('e2e-admin@mwpanel.local');
    await page.locator('input[type="password"]').fill('E2eAdminPassword!123');
    await page.getByRole('button', { name: 'Zaloguj się' }).click();

    await expect(page).toHaveURL(/\/$/);

    await page.goto('/generator?template=UP');

    const clientSelect = page.locator('select[title="Select client"]');
    const propertySelect = page.locator('select[title="Select property"]');
    const agentSelect = page.locator('select[title="Select agent"]');

    await expect(clientSelect).toBeVisible();

    if (await clientSelect.locator('option').count() > 1) {
      await clientSelect.selectOption({ index: 1 });
    }
    if (await propertySelect.locator('option').count() > 1) {
      await propertySelect.selectOption({ index: 1 });
    }
    if (await agentSelect.locator('option').count() > 1) {
      await agentSelect.selectOption({ index: 1 });
    }

    await page.getByRole('button', { name: 'Autofill from CRM' }).click();

    await page.getByRole('button', { name: 'Preview document' }).click();
    await expect(page.getByText('Document preview')).toBeVisible();

    await page.getByRole('button', { name: 'Back to form' }).click();

    await page.goto('/dokumenty');
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible();

    const initialVersionText = (await firstRow.locator('td').nth(4).innerText()).trim();
    const initialVersion = Number(initialVersionText) || 0;

    const sentButton = firstRow.locator('button[title="Oznacz jako wysłany"]');
    await expect(sentButton).toBeVisible();
    await sentButton.click();
    await expect(firstRow).toContainText('Wysłany');

    const signedButton = firstRow.locator('button[title="Oznacz jako podpisany"]');
    await expect(signedButton).toBeVisible();
    await signedButton.click();
    await expect(firstRow).toContainText('Podpisany');

    const finalVersionText = (await firstRow.locator('td').nth(4).innerText()).trim();
    const finalVersion = Number(finalVersionText) || 0;
    expect(finalVersion).toBeGreaterThan(initialVersion);
  });

  test('redirects legacy preview route to unified registry generator', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('e2e-admin@mwpanel.local');
    await page.locator('input[type="password"]').fill('E2eAdminPassword!123');
    await page.getByRole('button', { name: 'Zaloguj się' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/dokumenty/preview/umowa-posrednictwa/legacy-doc-id');
    await expect(page).toHaveURL(/\/generator\?template=UP&documentId=legacy-doc-id/);
  });
});
