import type { Locator } from '@playwright/test';

export function shortcutsFor(object: Locator) {
  return object.locator('[data-canvas-action-anchor="quick"]').locator('xpath=id(@aria-controls)');
}
