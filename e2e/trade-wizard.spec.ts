import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import type { ChatMessage, TradeLifecycleStatus } from "../lib/mostro/types";

const orderId = "99999999-9999-4999-8999-999999999999";
const invoice = `lnbc56780n1${"qpzry9x8gf2tvdw0s3jn54khce6mua7l".repeat(12)}`;
const bond: TradeLifecycleStatus = { step: "waiting_for_bond", kind: "sell", role: "taker", bondRequired: true, bondInvoice: invoice, readyForInvoice: false };

async function mockTrade(page: Page, getLifecycle: () => TradeLifecycleStatus) {
  await page.route(`**/api/trades/${orderId}/messages**`, (route) => route.fulfill({ json: {
    ok: true, data: { messages: [], ambiguousMessages: [], lifecycle: getLifecycle() }
  } }));
  await page.route(`**/api/trades/${orderId}/chat**`, (route) => route.fulfill({ json: {
    ok: true, data: { ready: true, counterpartyPubkey: "1".repeat(64), messages: [] }
  } }));
}

test("guarantee QR is readable on desktop and mobile, with copy and share", async ({ page, context }, testInfo) => {
  await mockTrade(page, () => bond);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { Reflect.set(window, "sharedInvoice", data); } });
  });
  await page.goto(`/trades/${orderId}`);
  await expect(page.getByRole("heading", { name: "Garantía anti-abuso" })).toBeVisible();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    const qr = page.getByRole("img", { name: "QR: Invoice de garantía anti-abuso" });
    await qr.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const png = PNG.sync.read(await qr.screenshot({ path: testInfo.outputPath(`qr-${viewport.width}.png`) }));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(invoice.toUpperCase());
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`guarantee-${viewport.width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Ampliar QR" }).click();
  await expect(page.getByRole("dialog", { name: "QR de pago ampliado" })).toBeVisible();
  const expandedQr = PNG.sync.read(await page.getByRole("img", { name: "QR ampliado: Invoice de garantía anti-abuso" }).screenshot());
  expect(jsQR(new Uint8ClampedArray(expandedQr.data), expandedQr.width, expandedQr.height)?.data).toBe(invoice.toUpperCase());
  await page.screenshot({ path: testInfo.outputPath("qr-expanded-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "QR de pago ampliado" })).not.toBeVisible();
  await page.getByRole("button", { name: "Copiar invoice", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(invoice);
  await page.getByRole("button", { name: "Compartir", exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, "sharedInvoice"))).toEqual({ title: "Invoice de garantía anti-abuso", text: invoice });
  await expect(page.getByRole("link", { name: "Abrir wallet" })).toHaveAttribute("href", `lightning:${invoice}`);
  await expect(page.getByRole("button", { name: "Marcar fiat como enviado" })).toHaveCount(0);
});

test("copy and share failures leave a selectable invoice and cancel is silent", async ({ page }) => {
  await mockTrade(page, () => bond);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("blocked"); } } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("Canceled", "AbortError"); } });
  });
  await page.goto(`/trades/${orderId}`);
  await page.getByRole("button", { name: "Copiar invoice", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "No pudimos copiarla" })).toBeVisible();
  await page.getByText("Ver invoice completa", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Invoice de garantía anti-abuso", exact: true })).toHaveValue(invoice);
  await page.getByRole("button", { name: "Compartir", exact: true }).click();
  await expect(page.getByText(/No pudimos compartir/)).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  await page.getByRole("button", { name: "Compartir", exact: true }).click();
  await expect(page.getByText(/Tu navegador no permite compartir directamente/)).toBeVisible();
});

test("wizard keeps bond unconfirmed and advances only with the trade lifecycle", async ({ page }) => {
  let lifecycle = bond;
  let fiatRequests = 0;
  await mockTrade(page, () => lifecycle);
  await page.route(`**/api/trades/${orderId}/fiat-sent`, async (route) => {
    fiatRequests++;
    expect(route.request().postDataJSON()).toEqual({ confirmedActualFiatTransfer: true });
    lifecycle = { ...bond, step: "fiat_marked_sent" };
    await route.fulfill({ json: { ok: true, data: { message: "Pago notificado." } } });
  });
  await page.goto(`/trades/${orderId}`);
  await expect(page.getByRole("button", { name: "Continuar con mi invoice" })).toBeDisabled();
  await page.getByLabel(/Confirmo que pagué o inicié/).check();
  await page.getByRole("button", { name: "Continuar con mi invoice" }).click();
  await expect(page.getByText(/Garantía pendiente de confirmación/)).toBeVisible();
  const progress = page.getByRole("navigation", { name: "Progreso de la operación" });
  await expect(progress.getByRole("listitem").first()).toContainText("Pendiente");
  await expect(page.getByRole("button", { name: "Marcar fiat como enviado" })).toHaveCount(0);

  lifecycle = { ...bond, step: "waiting_for_lock" };
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("heading", { name: "Espera a que se aseguren los sats" })).toBeVisible();
  lifecycle = { ...bond, step: "ready_for_fiat" };
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("button", { name: "Marcar fiat como enviado" })).toBeDisabled();
  await page.getByLabel("Confirmo que ya envié el pago fiat.").check();
  await page.getByRole("button", { name: "Marcar fiat como enviado" }).click();
  await expect(page.getByRole("heading", { name: "Espera la liberación de tus sats" })).toBeVisible();
  expect(fiatRequests).toBe(1);
  await expect(page.getByRole("button", { name: "Marcar fiat como enviado" })).toHaveCount(0);
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  lifecycle = { ...bond, step: "completed" };
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("heading", { name: "Operación completada" })).toBeVisible();
  await expect(page.getByRole("radiogroup")).toBeVisible();
});

test("seller release requires fiat confirmation and remains pending until buyer payment", async ({ page }) => {
  let lifecycle: TradeLifecycleStatus = { ...bond, kind: "buy", step: "waiting_for_lock", bondRequired: false, bondInvoice: undefined, paymentInvoice: invoice };
  let releases = 0;
  await mockTrade(page, () => lifecycle);
  await page.route(`**/api/trades/${orderId}/release`, async (route) => {
    releases++;
    expect(route.request().postDataJSON()).toEqual({ confirmedFiatReceived: true });
    lifecycle = { ...lifecycle, step: "waiting_for_payout" };
    await route.fulfill({ json: { ok: true, data: { message: "Liberación confirmada." } } });
  });
  await page.goto(`/trades/${orderId}`);
  await expect(page.getByRole("img", { name: "QR: Hold invoice de la operación" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Liberar sats" })).toHaveCount(0);
  lifecycle = { ...lifecycle, step: "waiting_for_fiat" };
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("heading", { name: "Espera el pago del comprador" })).toBeVisible();
  lifecycle = { ...lifecycle, step: "fiat_marked_sent" };
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("button", { name: "Liberar sats" })).toBeDisabled();
  await page.getByLabel("Confirmo que recibí y verifiqué el pago fiat.").check();
  await page.getByRole("button", { name: "Liberar sats" }).click();
  await expect(page.getByRole("heading", { name: "Sats liberados; cobro pendiente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Liberar sats" })).toHaveCount(0);
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  lifecycle = { ...lifecycle, step: "needs_payout_invoice", payoutSats: 2224 };
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByText("Mostro solicitó una nueva invoice al comprador para completar el pago.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualizar invoice" })).toHaveCount(0);
  lifecycle = { ...lifecycle, step: "completed" };
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("heading", { name: "Operación completada" })).toBeVisible();
  expect(releases).toBe(1);
});

test("buyer replaces a failed payout invoice within the final step, including rejection and reload", async ({ page }, testInfo) => {
  let lifecycle: TradeLifecycleStatus = { ...bond, step: "needs_payout_invoice", payoutSats: 2224, bondRequired: false, bondInvoice: undefined };
  let attempts = 0;
  await mockTrade(page, () => lifecycle);
  await page.route("**/api/trades/add-invoice", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ orderId, invoice });
    attempts++;
    if (attempts === 1) {
      await route.fulfill({ status: 400, json: { ok: false, error: { code: "INVALID_INVOICE", message: "La invoice venció. Genera una nueva." } } });
    } else {
      lifecycle = { ...lifecycle, step: "waiting_for_payout" };
      await route.fulfill({ json: { ok: true, data: { message: "Invoice actualizada. El pago sigue pendiente." } } });
    }
  });
  await page.goto(`/trades/${orderId}`);
  await expect(page.getByRole("heading", { name: "Agrega una nueva invoice para cobrar" })).toBeVisible();
  await expect(page.getByText("2.224 sats", { exact: true })).toBeVisible();
  await expect(page.getByText("2224 sats", { exact: true })).toHaveCount(0);
  await expect(page.locator('[aria-current="step"]')).toContainText("Finalizar");
  await expect(page.getByRole("button", { name: "Actualizar invoice", exact: true })).toBeDisabled();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`payout-${viewport.width}.png`), fullPage: true });
  }
  await page.getByRole("textbox", { name: "Nueva invoice para cobrar" }).fill(invoice);
  await page.getByRole("button", { name: "Actualizar invoice", exact: true }).click();
  await expect(page.getByText("La invoice venció. Genera una nueva.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Nueva invoice para cobrar" })).toHaveValue(invoice);
  await expect(page.locator('[aria-current="step"]')).toContainText("Finalizar");
  await page.getByRole("button", { name: "Actualizar invoice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Esperando el pago a tu wallet" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Esperando el pago a tu wallet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualizar invoice", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Marcar fiat como enviado" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Liberar sats" })).toHaveCount(0);
  await expect(page.getByText("Abrir disputa", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  lifecycle = { ...lifecycle, step: "completed" };
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("heading", { name: "Operación completada" })).toBeVisible();
  await expect(page.getByRole("radiogroup")).toBeVisible();
  expect(attempts).toBe(2);
});

test("floating chat polls while closed, deduplicates unread messages and keeps drafts", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await mockTrade(page, () => ({ ...bond, step: "ready_for_fiat" }));
  const messages: ChatMessage[] = [{ id: "incoming-1", direction: "incoming", text: "Hola, estos son los datos de pago.", timestamp: "2026-09-04T20:00:00Z" }];
  let requests = 0;
  await page.route(`**/api/trades/${orderId}/chat**`, (route) => {
    requests++;
    return route.fulfill({ json: { ok: true, data: { ready: true, counterpartyPubkey: "1".repeat(64), messages } } });
  });
  await page.goto(`/trades/${orderId}`);
  await expect(page.getByRole("button", { name: "Abrir chat, 1 mensaje sin leer" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Abrir chat/ }).click();
  const dialog = page.getByRole("dialog", { name: "Chat de la operación" });
  await expect(dialog.getByText(messages[0].text)).toBeVisible();
  await dialog.getByPlaceholder("Escribe un mensaje").fill("Mi mensaje sin enviar");
  await page.screenshot({ path: testInfo.outputPath("chat-mobile.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Abrir chat", exact: true })).toBeFocused();
  messages.push(
    { id: "incoming-2", direction: "incoming", text: "Avísame cuando termines la transferencia.", timestamp: "2026-09-04T20:01:00Z" },
    { id: "incoming-2", direction: "incoming", text: "Avísame cuando termines la transferencia.", timestamp: "2026-09-04T20:01:00Z" },
    { id: "outgoing-1", direction: "outgoing", text: "Un mensaje mío anterior", timestamp: "2026-09-04T20:00:00Z" }
  );
  const beforePoll = requests;
  await page.clock.fastForward(30_000);
  await expect.poll(() => requests).toBeGreaterThan(beforePoll);
  await expect(page.getByRole("button", { name: "Abrir chat, 1 mensaje sin leer" })).toBeVisible();
  await page.getByRole("button", { name: /^Abrir chat/ }).click();
  await expect(dialog.getByPlaceholder("Escribe un mensaje")).toHaveValue("Mi mensaje sin enviar");
  await expect(dialog.getByText(messages[1].text)).toHaveCount(1);
  await dialog.getByRole("button", { name: "Cerrar chat" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Abrir chat", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /sin leer/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
