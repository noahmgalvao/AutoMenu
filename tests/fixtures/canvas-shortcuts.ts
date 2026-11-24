import type { Locator } from '@playwright/test';

export function shortcutsFor(object: Locator) {
  return object.locator('[data-canvas-action-anchor="quick"]').locator('xpath=id(@aria-controls)');
}

export function canvasActionsFor(object: Locator, kind?: string) {
  return object.locator(kind ? `[data-canvas-action-anchor="${kind}"]` : '[data-canvas-action-anchor]')
    .locator('xpath=id(@aria-controls)');
}
