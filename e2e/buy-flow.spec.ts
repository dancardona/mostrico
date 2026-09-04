import { expect, test } from "@playwright/test";

test("buyer can take a COP sell order and guard fiat sent", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByText("mostro-cli 0.16.1")).toBeVisible();

  await page.goto("/market");
  await expect(page.getByRole("heading", { name: "Comprar Bitcoin" })).toBeVisible();
  await page.getByRole("link", { name: "Ver oferta" }).click();

  await expect(page.getByText("50.000 COP - 150.000 COP")).toBeVisible();
  await page.getByPlaceholder("100.000").fill("100.000");
  await expect(page.getByText("Monto: 100.000 COP")).toBeVisible();
  await page.getByPlaceholder("lnbc...").fill("lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka");
  await page.getByLabel("Confirmo que quiero tomar esta oferta como comprador.").check();
  await page.getByRole("button", { name: /Tomar oferta/ }).click();
  await page.waitForURL("**/trades/11111111-1111-4111-8111-111111111111?bond=pending&invoice=pending", { timeout: 15_000 });

  await expect(page.getByRole("heading", { name: "Operación" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Garantía anti-abuso" })).toBeVisible();
  await expect(page.getByLabel("Invoice de garantía anti-abuso")).toHaveValue(/^lnbc/);
  await expect(page.getByText(/Paga primero la garantía/)).toBeVisible();
  await page.getByLabel(/Confirmo que pagué o inicié el pago/).check();
  await page.getByPlaceholder("lnbc...").fill("lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka");
  await page.getByRole("button", { name: "Agregar invoice" }).click();
  await expect(page.getByText("Invoice Lightning agregada", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar invoice" })).toHaveCount(0);

  await page.getByPlaceholder("npub1... o 64 caracteres hex").fill("1".repeat(64));
  await page.getByRole("button", { name: "Guardar contraparte" }).click();
  await expect(page.getByText("Hola, ya vi la operación.")).toBeVisible();
  await page.getByPlaceholder("Escribe un mensaje").fill("Hola, ya inicié el pago");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Hola, ya inicié el pago")).toBeVisible();

  const fiatButton = page.getByRole("button", { name: "Marcar fiat como enviado" });
  await expect(fiatButton).toBeDisabled();
  await page.getByLabel("Confirmo que ya envié el pago fiat.").check();
  await expect(fiatButton).toBeEnabled();
  await fiatButton.click();
  await expect(page.getByText("Pago fiat notificado", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "5 estrellas" }).click();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/trades/11111111-1111-4111-8111-111111111111/rate`) && response.request().method() === "POST"),
    page.getByRole("button", { name: "Enviar calificación" }).click()
  ]);
  await expect(page.getByText("Calificación enviada", { exact: true })).toBeVisible({ timeout: 15_000 });
});

test("formats an invalid trade index and offers explicit synchronization", async ({ page }) => {
  await page.route("**/api/trades/take-sell", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "TRADE_INDEX_OUT_OF_SYNC",
          message: "Mostro rechazó la operación porque el índice local está desincronizado. La oferta no fue tomada. Sincroniza el índice y vuelve a intentarlo."
        }
      })
    });
  });
  await page.route("**/api/trades/sync-index", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { message: "Índice de operaciones sincronizado. Ya puedes volver a intentar tomar la oferta." } })
    });
  });

  await page.goto("/orders/11111111-1111-4111-8111-111111111111");
  await page.getByPlaceholder("100.000").fill("100.000");
  await page.getByLabel("Agregar invoice después").check();
  await page.getByLabel("Confirmo que quiero tomar esta oferta como comprador.").check();
  await page.getByRole("button", { name: /Tomar oferta/ }).click();

  await expect(page.getByText(/La oferta no fue tomada/)).toBeVisible();
  await expect(page.getByText(/Take Order|InvalidTradeIndex/)).toHaveCount(0);
  await page.getByRole("button", { name: "Sincronizar índice" }).click();
  await expect(page.getByText(/Índice de operaciones sincronizado/)).toBeVisible();
  await expect(page).toHaveURL(/\/orders\/11111111-1111-4111-8111-111111111111$/);
});

test("formats an invoice rejected by the current order status", async ({ page }) => {
  let messageRequests = 0;
  await page.route("**/api/trades/11111111-1111-4111-8111-111111111111/messages**", async (route) => {
    messageRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          messages: [],
          ambiguousMessages: [],
          lifecycle: { step: "needs_invoice", bondRequired: false, readyForInvoice: true }
        }
      })
    });
  });
  await page.route("**/api/trades/add-invoice", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "ACTION_NOT_ALLOWED",
          message: "Mostro no permite realizar esta acción en el estado actual de la orden.",
          details: {
            title: "Acción no disponible",
            hint: "Actualiza los mensajes de la operación antes de intentarlo de nuevo.",
            reason: "NotAllowedByStatus"
          }
        }
      })
    });
  });

  await page.goto("/trades/11111111-1111-4111-8111-111111111111");
  await page.getByPlaceholder("lnbc...").fill("lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka");
  await page.getByRole("button", { name: "Agregar invoice" }).click();

  await expect(page.getByText("Acción no disponible", { exact: true })).toBeVisible();
  await expect(page.getByText(/estado actual de la orden/)).toBeVisible();
  await expect(page.getByText(/Actualiza los mensajes/)).toBeVisible();
  await expect.poll(() => messageRequests).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByText("Acción no disponible", { exact: true })).toHaveCount(0);
  await expect.poll(() => messageRequests).toBeGreaterThanOrEqual(3);
  await expect(page.getByText(/Add Lightning Invoice|NotAllowedByStatus|legacy token columns/)).toHaveCount(0);
});

test("creates buy and sell maker orders without paying from the app", async ({ page }) => {
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Crear orden" })).toBeVisible();

  await page.getByPlaceholder("100.000").fill("150.000");
  await expect(page.getByPlaceholder("100.000")).toHaveValue("150.000");
  await page.getByPlaceholder("Nequi, Bancolombia").fill("Nequi, Bancolombia");
  await page.getByLabel("Confirmo que quiero publicar esta orden en Mostro.").check();
  await page.getByRole("button", { name: "Publicar orden" }).click();

  await expect(page.getByRole("heading", { name: "Orden creada" })).toBeVisible();
  await expect(page.getByText("33333333-3333-4333-8333-333333333333")).toBeVisible();
  await expect(page.getByLabel("Hold invoice")).toHaveCount(0);
  await page.getByRole("link", { name: "Ver mi orden" }).click();
  await expect(page).toHaveURL(/\/my-orders\/33333333-3333-4333-8333-333333333333$/);
  await expect(page.getByRole("heading", { name: "Compra de Bitcoin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar fiat como enviado" })).toBeDisabled();

  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Vender BTC" }).click();
  await page.getByPlaceholder("100.000").fill("200.000");
  await expect(page.getByPlaceholder("100.000")).toHaveValue("200.000");
  await page.getByPlaceholder("Nequi, Bancolombia").fill("Nequi");
  await page.getByLabel("Confirmo que quiero publicar esta orden en Mostro.").check();
  await page.getByRole("button", { name: "Publicar orden" }).click();

  await expect(page.getByRole("heading", { name: "Orden creada" })).toBeVisible();
  await expect(page.getByText("44444444-4444-4444-8444-444444444444")).toBeVisible();
  await expect(page.getByLabel("Hold invoice")).toHaveValue(/^lnbc/);
  await expect(page.getByText(/Mostrico no realiza este pago/)).toBeVisible();
  await page.getByRole("link", { name: "Ver mi orden" }).click();
  await expect(page.getByRole("heading", { name: "Venta de Bitcoin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Liberar sats" })).toBeDisabled();
});
