import type { Locator } from '@playwright/test';

export async function chooseDesignerOption(picker: Locator, value: string) {
  const options = picker.locator('..').getByRole('listbox');
  if (await picker.getAttribute('aria-expanded') !== 'true') await picker.click();
  await options.getByRole('option').and(options.locator(`[data-option-value=${JSON.stringify(value)}]`)).click();
}
