import { expect, test, type Page } from "@playwright/test";

const id = "88888888-8888-4888-8888-888888888888";
const methods = ["Nequi y Bancolombia. Solo transferencias desde una cuenta propia. Confirmar los datos antes de enviar el pago. ".repeat(3)];
const invoice = `lnbc56780n1${"qpzry9x8gf2tvdw0s3jn54khce6mua7l".repeat(12)}`;

async function mockScreens(page: Page) {
  await page.route("**/api/diagnostics", (route) => route.fulfill({ json: { ok: true, data: {
    cliFound: true, cliVersion: "mostro-cli 0.16.0", supported: true, machineApiVersion: 1,
    machineFeatures: ["restore-persist", "add-invoice", "fiat-sent", "release", "list-orders"], mostroConfigured: true, relayCount: 2, warnings: []
  } } }));
  await page.route(`**/api/orders/${id}`, (route) => route.fulfill({ json: { ok: true, data: {
    id, kind: "sell", currency: "COP", minFiatAmount: "100000", maxFiatAmount: "4000000", premiumPct: 1.5, paymentMethods: methods, status: "pending"
  } } }));
  await page.route(`**/api/my-orders/${id}`, (route) => route.fulfill({ json: { ok: true, data: {
    orderId: id, kind: "sell", role: "maker", currency: "COP", selectedFiatAmount: "100000-4000000", satsAmount: "0", premiumPct: 1.5, paymentMethods: methods, lastKnownStep: "maker_pending"
  } } }));
  await page.route(`**/api/trades/${id}/messages**`, (route) => route.fulfill({ json: { ok: true, data: {
    messages: [], ambiguousMessages: [], lifecycle: { step: "waiting_for_bond", bondRequired: true, bondInvoice: invoice, readyForInvoice: false }
  } } }));
  await page.route(`**/api/trades/${id}/chat**`, (route) => route.fulfill({ json: { ok: true, data: { ready: true, counterpartyPubkey: "1".repeat(64), messages: [] } } }));
}

test("all screens share the visual system without overflow", async ({ page }, testInfo) => {
  await mockScreens(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const screens = [
    { path: "/", title: "Mostrico", file: "home" },
    { path: "/setup", title: "Setup local", file: "setup" },
    { path: "/orders/new", title: "Crear orden", file: "new-order" },
    { path: `/orders/${id}`, title: "Tomar oferta", file: "offer" },
    { path: `/my-orders/${id}`, title: "Venta de Bitcoin", file: "my-order" },
    { path: `/trades/${id}`, title: "Operación", file: "trade" },
    { path: "/missing-screen", title: "Página no encontrada", file: "not-found" }
  ];
  for (const screen of screens) {
    await page.goto(screen.path);
    await expect(page.getByRole("heading", { level: 1, name: screen.title, exact: true })).toBeVisible();
    if (screen.file === "setup") await expect(page.getByRole("heading", { name: "CLI instalado" })).toBeVisible();
    if (screen.file === "trade") await expect(page.getByRole("img", { name: "QR: Invoice de garantía anti-abuso" })).toBeVisible();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${screen.file} at ${width}px`).toBe(true);
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(21, 23, 24)");
      await expect(page.locator("h1")).toHaveCSS("font-size", width < 500 ? "27px" : "32px");
      await page.screenshot({ path: testInfo.outputPath(`${screen.file}-${width}.png`), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test("shared navigation is accessible on mobile and marks the current route", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockScreens(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link", { name: "Inicio", exact: true })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Crear", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Crear orden" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Crear", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Inicio", exact: true })).not.toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Setup local" })).toBeVisible();
});

test("compact navigation fits wider fallback fonts without clipping links", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/orders/new");
  // Linux system fonts are wider than the macOS font used by local runs.
  await page.addStyleTag({ content: ".ds-nav { font-family: monospace; }" });
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(5);
  const boxes = await links.evaluateAll((elements) => elements.map((element) => {
    const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
    return { left, right, top, bottom, width, height };
  }));
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(16);
    expect(box.right).toBeLessThanOrEqual(304);
    expect(box.height).toBeGreaterThanOrEqual(40);
  }
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index].width).toBeGreaterThanOrEqual(40);
    expect(boxes[index].left >= boxes[index - 1].right || boxes[index].top >= boxes[index - 1].bottom).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await nav.getByRole("link", { name: "Inicio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mostrico", exact: true })).toBeVisible();
});

test("range and price controls retain formatting and explicit confirmation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Vender BTC", exact: true }).click();
  await page.getByRole("button", { name: "Rango", exact: true }).click();
  await page.getByLabel("Monto mínimo", { exact: true }).fill("100000");
  await page.getByLabel("Monto máximo", { exact: true }).fill("4000000");
  await expect(page.getByLabel("Monto máximo", { exact: true })).toHaveValue("4.000.000");
  await page.getByRole("button", { name: "Sats fijos", exact: true }).click();
  await page.getByLabel("Cantidad de sats", { exact: true }).fill("100000");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Métodos de pago", { exact: true }).fill("Nequi");
  await page.getByRole("button", { name: "Revisar oferta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publicar orden" })).toBeDisabled();
  await page.getByLabel("Confirmo que quiero publicar esta orden en Mostro.").check();
  await expect(page.getByRole("button", { name: "Publicar orden" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("range-form-320.png"), fullPage: true });
});
