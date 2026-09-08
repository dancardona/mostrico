import { expect, test, type Page } from "@playwright/test";
import type { MostroOrder } from "../lib/mostro/types";

const conditions = "Nequi / Bancolombia / Llaves BRE-B. Solo transferencias desde una cuenta propia. Confirma los datos en el chat antes de enviar el pago. ".repeat(3);
const offers: MostroOrder[] = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "sell", currency: "COP", fiatAmount: "30000", sats: 2224, premiumPct: 0, paymentMethods: ["Nequi"], createdAt: "2026-09-04 15:00" },
  { id: "22222222-2222-4222-8222-222222222222", kind: "sell", currency: "COP", minFiatAmount: "100000", maxFiatAmount: "4000000", premiumPct: 2, paymentMethods: [conditions], createdAt: "2026-09-04 16:00" },
  { id: "33333333-3333-4333-8333-333333333333", kind: "sell", currency: "COP", minFiatAmount: "10000", maxFiatAmount: "300000", premiumPct: 3, paymentMethods: ["Daviplata", "PSE", "Llaves BRE-B"], createdAt: "2026-09-04 17:00" },
  { id: "44444444-4444-4444-8444-444444444444", kind: "sell", currency: "COP", minFiatAmount: "500000", maxFiatAmount: "2000000", premiumPct: 4, paymentMethods: ["Nequi", "Bancolombia"], createdAt: "2026-09-04 18:00" },
  { id: "55555555-5555-4555-8555-555555555555", kind: "sell", currency: "COP", minFiatAmount: "1000000", maxFiatAmount: "100000000", paymentMethods: ["Transferencia bancaria"], createdAt: "2026-09-04 19:00" },
  { id: "66666666-6666-4666-8666-666666666666", kind: "buy", currency: "COP", minFiatAmount: "20000", maxFiatAmount: "300000", premiumPct: 1.5, paymentMethods: ["Nequi"] }
];

async function mockMarket(page: Page) {
  await page.route("**/api/orders?**", (route) => route.fulfill({ json: { ok: true, data: offers } }));
}
const rows = (page: Page) => page.getByRole("list", { name: "Lista de ofertas" }).getByRole("listitem");

test("shows publication dates in Colombia time and never substitutes refresh time", async ({ page }) => {
  await page.route("**/api/orders?**", (route) => route.fulfill({ json: { ok: true, data: [
    offers[0], { ...offers[1], createdAt: undefined, listedAt: "2026-09-07T12:00:00Z" },
    { ...offers[2], createdAt: "invalid" }
  ] } }));
  await page.goto("/market");
  const date = rows(page).first().locator("time");
  await expect(date).toHaveAttribute("datetime", "2026-09-04T15:00:00.000Z");
  await expect(date).toContainText(/04.*sep.*2026.*10:00/);
  await expect(date).toHaveAttribute("title", /hora de Colombia, UTC-5/);
  await expect(page.getByText("Fecha no disponible", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Refrescar", exact: true }).click();
  await expect(date).toHaveAttribute("datetime", "2026-09-04T15:00:00.000Z");
});

test("filters formatted amounts and payment methods, sorts and resets", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/market");
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).first()).toContainText("2.224 sats");
  await page.getByLabel("Quiero comprar por").fill("100000");
  await expect(page.getByLabel("Quiero comprar por")).toHaveValue("100.000");
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel("Método de pago", { exact: true }).selectOption("Nequi");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("#22222222");
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(rows(page)).toHaveCount(5);
  await page.getByLabel("Ordenar por").selectOption("amount");
  await expect(rows(page).first()).toContainText("#33333333");
  await page.getByLabel("Ordenar por").selectOption("newest");
  await expect(rows(page).first()).toContainText("#55555555");
  await expect(rows(page).first()).toContainText("100.000.000");
  await page.getByLabel("Ordenar por").selectOption({ label: "Más antiguas" });
  await expect(rows(page).first()).toContainText("#11111111");
  await expect(rows(page).last()).toContainText("#55555555");
  await page.getByLabel("Ordenar por").selectOption({ label: "Más recientes" });
  await page.getByLabel("Quiero comprar por").fill("1");
  await expect(page.getByRole("heading", { name: "No hay ofertas con estos filtros" })).toBeVisible();
  await page.getByRole("button", { name: "Borrar monto" }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).last().getByRole("link", { name: "Ver oferta" })).toHaveAttribute("href", `/orders/${offers[0].id}`);
});

test("saved offers persist across reloads and can be removed", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/market");
  await page.getByRole("button", { name: "Guardar oferta 22222222" }).click();
  await page.reload();
  await page.getByRole("button", { name: /Guardadas/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("#22222222");
  await page.getByRole("button", { name: "Quitar oferta 22222222" }).click();
  await expect(page.getByText("No hay ofertas guardadas que coincidan con esta búsqueda.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mostrico.market.saved-orders"))).toBe("[]");
});

test("switches trade intent with keyboard and ignores superseded responses", async ({ page }) => {
  let releaseFirst!: () => void;
  const delayed = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let started = false;
  await page.route("**/api/orders?**", async (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind");
    if (kind === "sell") { started = true; await delayed; }
    await route.fulfill({ json: { ok: true, data: offers.filter((order) => order.kind === kind) } });
  });
  await page.goto("/market");
  await expect(page.getByRole("status", { name: "Cargando ofertas" })).toBeVisible();
  await expect.poll(() => started).toBe(true);
  await page.getByRole("tab", { name: "Comprar" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Vender" })).toBeFocused();
  await expect(rows(page)).toHaveCount(1);
  releaseFirst();
  await expect(rows(page).first()).toContainText("Oferta de compra");
  await expect(rows(page).first()).toContainText("+1,5 %");
  await page.keyboard.press("Home");
  await expect(rows(page)).toHaveCount(5);
});

test("retries connection errors and preserves the last successful results", async ({ page }) => {
  let failing = true;
  await page.route("**/api/orders?**", (route) => route.fulfill({ status: failing ? 503 : 200, json: failing ? { ok: false, error: { message: "Relay no disponible." } } : { ok: true, data: offers } }));
  await page.goto("/market");
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo actualizar el mercado" })).toContainText("Relay no disponible.");
  await expect(page.getByRole("heading", { name: "El mercado no está disponible" })).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(rows(page)).toHaveCount(5);
  failing = true;
  await page.getByRole("button", { name: "Refrescar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo actualizar el mercado" })).toContainText("Se conservan las últimas ofertas consultadas.");
  await expect(rows(page)).toHaveCount(5);
});

test("renders readable offers and expanded conditions across screen sizes", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockMarket(page);
  await page.goto("/market");
  await expect(rows(page)).toHaveCount(5);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: testInfo.outputPath(`market-${viewport.width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const collisions = await rows(page).evaluateAll((elements) => elements.flatMap((row) => {
      const main = row.firstElementChild!;
      const children = [...main.children].map((element) => element.getBoundingClientRect());
      const overlaps: string[] = [];
      const date = row.querySelector("time")!.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      if (date.top < main.getBoundingClientRect().bottom || bounds.right - date.right > 19 || bounds.bottom - date.bottom > 22) overlaps.push("date is not at bottom right");
      const summary = row.querySelector("summary")?.getBoundingClientRect();
      const dateRow = row.querySelector("time")!.parentElement!.getBoundingClientRect();
      if (summary && (Math.abs(summary.top + summary.height / 2 - dateRow.top - dateRow.height / 2) > 1 || summary.right > dateRow.left)) overlaps.push("date is not aligned with conditions");
      for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
        const a = children[i], b = children[j];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${i}:${j}`);
      }
      return overlaps;
    }));
    expect(collisions).toEqual([]);
  }
  await page.getByText("Condiciones del anunciante", { exact: true }).click();
  await expect(page.locator("details[open] p")).toHaveText(conditions.trim());
  const expanded = rows(page).filter({ has: page.locator("details[open]") });
  expect(await expanded.evaluate((row) => {
    const summary = row.querySelector("summary")!.getBoundingClientRect();
    const date = row.querySelector("time")!.parentElement!.getBoundingClientRect();
    return Math.abs(summary.top + summary.height / 2 - date.top - date.height / 2) <= 1 && date.bottom <= row.querySelector("details p")!.getBoundingClientRect().top;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("market-conditions-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("mobile filters expand without hiding active selections", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMarket(page);
  await page.goto("/market");
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).first().getByRole("link", { name: "Ver oferta" })).toBeInViewport();
  await expect(page.getByLabel("Método de pago", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Mostrar filtros" }).click();
  await page.getByLabel("Método de pago", { exact: true }).selectOption("Nequi");
  await expect(rows(page)).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("market-mobile-filters.png"), fullPage: true });
  await page.getByRole("button", { name: "Ocultar filtros" }).click();
  await expect(page.getByRole("button", { name: "Mostrar filtros" })).toContainText("1");
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(rows(page)).toHaveCount(5);
});
