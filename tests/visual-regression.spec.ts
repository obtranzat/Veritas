import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

const WORKSPACES = [
  { id: 'analyzer', navLabel: 'Intelligence Hub' },
  { id: 'factcheck', navLabel: 'Fact & Source Lab' },
  { id: 'code', navLabel: 'Code & Security' },
  { id: 'provenance', navLabel: 'Provenance & Auth' },
  { id: 'media', navLabel: 'Media Forensics' },
  { id: 'history', navLabel: 'History & Audit' },
  { id: 'team', navLabel: 'Privacy & Team' },
] as const;

async function navigateWorkspace(page: Page, navLabel: string, viewportWidth: number) {
  if (viewportWidth < 1024) {
    const openMenu = page.getByRole('button', { name: 'Open navigation' });
    await openMenu.click();
    await page.getByRole('button', { name: navLabel, exact: true }).click();
  } else {
    await page.getByRole('button', { name: navLabel, exact: true }).click();
  }
  await page.waitForLoadState('networkidle');
}

async function assertLayoutHealth(page: Page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);

  const brokenImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.getAttribute('src') || img.alt);
  });
  expect(brokenImages).toEqual([]);
}

test.describe('Veritas Visual Regression & Responsive Matrix (360 / 768 / 1440 × Light / Dark)', () => {
  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${vp.name} · ${theme} mode · workspaces, lazy routes, modals & layout invariants`, async ({
        page,
      }) => {
        const runtimeErrors: string[] = [];
        page.on('pageerror', (err) => runtimeErrors.push(err.message));
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            runtimeErrors.push(msg.text());
          }
        });

        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/', { waitUntil: 'networkidle' });

        if (theme === 'dark') {
          await page.getByRole('button', { name: /color theme/i }).click();
          await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        }

        for (const ws of WORKSPACES) {
          await navigateWorkspace(page, ws.navLabel, vp.width);
          await expect(page.locator('#main-content')).toBeVisible();
          await assertLayoutHealth(page);

          await expect(page).toHaveScreenshot(`${vp.name}-${theme}-${ws.id}.png`, {
            fullPage: false,
            animations: 'disabled',
          });
        }

        // Verify Quick Search (Cmd/Ctrl+K) modal visual & Escape close
        await page.getByRole('button', { name: /Quick search/i }).click();
        await expect(page.getByRole('dialog', { name: /Quick search/i })).toBeVisible();
        await expect(page).toHaveScreenshot(`${vp.name}-${theme}-modal-search.png`, {
          animations: 'disabled',
        });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: /Quick search/i })).toBeHidden();

        expect(runtimeErrors).toEqual([]);
      });
    }
  }
});
