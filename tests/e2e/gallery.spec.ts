import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`UI gallery (${colorScheme} device theme)`, () => {
    test.use({ colorScheme });

    test("renders every primitive in both themes", async ({ page }, testInfo) => {
      await page.goto("/ui");
      await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(new RegExp(colorScheme));

      for (const panel of ["light", "dark"]) {
        const p = page.locator(`[data-theme-panel="${panel}"]`);
        await expect(p).toHaveClass(new RegExp(`\\b${panel}\\b`));
        for (const title of ["Typography", "Buttons", "Form controls", "Tabs", "Dialog, sheet and toast", "Avatar and badges", "Verified stamp", "States"]) {
          await expect(p.getByRole("heading", { name: title })).toBeVisible();
        }
      }

      // Panels really differ: light page ground vs dark page ground.
      const bg = (panel: string) =>
        page.locator(`[data-theme-panel="${panel}"]`).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(await bg("light")).toBe("rgb(240, 239, 237)");
      expect(await bg("dark")).toBe("rgb(10, 10, 9)");

      await testInfo.attach(`gallery-${colorScheme}-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: "disabled" }),
        contentType: "image/png",
      });
    });

    test("has no axe-core violations", async ({ page }) => {
      await page.goto("/ui");
      await page.getByRole("heading", { level: 1, name: "UI gallery" }).waitFor();
      // Let the Verified Stamp finish so contrast is measured on the end state.
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  });
}

test("dialog is keyboard-operable and has no axe violations when open", async ({ page }) => {
  await page.goto("/ui");
  const light = page.locator('[data-theme-panel="light"]');
  const trigger = light.getByRole("button", { name: "Open dialog" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Leave venture?" });
  await expect(dialog).toBeVisible();

  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("toast shows error with icon, text and request ref", async ({ page }) => {
  await page.goto("/ui");
  await page.locator('[data-theme-panel="dark"]').getByRole("button", { name: "Show toast" }).click();
  const region = page.getByRole("region", { name: /Notifications/ });
  const toast = region.getByRole("listitem").filter({ hasText: "Couldn't save your post" });
  await expect(toast).toBeVisible();
  await expect(toast.getByText("Ref: 7f3a9c1e")).toBeVisible();
  await expect(toast.locator("svg").first()).toBeVisible();
});

test("theme toggle switches the document theme", async ({ page }) => {
  await page.goto("/ui");
  await page.getByRole("radio", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Light theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
});
