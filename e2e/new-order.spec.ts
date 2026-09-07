import { expect, test, type Page } from "@playwright/test";

const id = "77777777-7777-4777-8777-777777777777";
const confirmLabel = "Confirmo que quiero publicar esta orden en Mostro.";

async function conditions(page: Page) {
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pago y vigencia" })).toBeVisible();
}

async function review(page: Page) {
  await page.getByRole("button", { name: "Revisar oferta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Todo listo para publicar" })).toBeVisible();
}

test("wizard validates each step and retains values when editing", async ({ page }) => {
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByLabel("Monto fiat", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Rango", exact: true }).click();
  await page.getByLabel("Monto mínimo", { exact: true }).fill("500000");
  await page.getByLabel("Monto máximo", { exact: true }).fill("100000");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText(/el máximo debe ser mayor/)).toBeVisible();
  await page.getByLabel("Monto máximo", { exact: true }).fill("4000000");
  await page.getByLabel("Premium", { exact: true }).fill("101");
  await expect(page.getByRole("button", { name: "Aumentar premium" })).toBeDisabled();
  await page.getByLabel("Premium", { exact: true }).fill("-99");
  await expect(page.getByRole("button", { name: "Disminuir premium" })).toBeDisabled();
  await page.getByLabel("Premium", { exact: true }).fill("2");
  await conditions(page);
  await page.getByRole("button", { name: "Revisar oferta", exact: true }).click();
  await expect(page.getByText(/Agrega de uno a cinco métodos/)).toBeVisible();
  await page.getByRole("checkbox", { name: "Nequi", exact: true }).check();
  await page.getByRole("checkbox", { name: "Bancolombia", exact: true }).check();
  await page.getByLabel("Expiración", { exact: true }).selectOption("7");
  await review(page);
  await expect(page.getByRole("button", { name: "Publicar orden" })).toBeDisabled();
  await page.getByLabel(confirmLabel).check();
  await page.getByRole("button", { name: "Editar operación" }).click();
  await expect(page.getByLabel("Monto mínimo", { exact: true })).toHaveValue("500.000");
  await expect(page.getByLabel("Monto máximo", { exact: true })).toHaveValue("4.000.000");
  await conditions(page);
  await expect(page.getByRole("checkbox", { name: "Nequi", exact: true })).toBeChecked();
  await expect(page.getByLabel("Expiración", { exact: true })).toHaveValue("7");
  await review(page);
  await expect(page.getByLabel(confirmLabel)).not.toBeChecked();
});

test("publishes the reviewed payload once and preserves partial confirmation", async ({ page }) => {
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/orders", async (route) => {
    expect(route.request().method()).toBe("POST");
    calls++;
    expect(route.request().postDataJSON()).toEqual({ kind: "buy", currency: "COP", fiatAmount: "250000", satsAmount: "0", paymentMethods: ["Nequi"], premium: 1, invoice: "me@example.com", expirationDays: 3, confirmed: true });
    await pending;
    await route.fulfill({ json: { ok: true, data: { orderId: id, kind: "buy", message: "Orden publicada.", partial: true } } });
  });
  await page.goto("/orders/new");
  await page.getByLabel("Monto fiat", { exact: true }).fill("250000");
  await page.getByRole("button", { name: "Aumentar premium" }).click();
  await conditions(page);
  await page.getByRole("checkbox", { name: "Nequi", exact: true }).check();
  await page.getByLabel("Expiración", { exact: true }).selectOption("3");
  await page.locator("summary").click();
  await page.getByRole("textbox", { name: "Invoice o Lightning Address", exact: true }).fill("me@example.com");
  await review(page);
  expect(calls).toBe(0);
  await page.getByLabel(confirmLabel).check();
  await page.getByRole("button", { name: "Publicar orden", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publicando...", exact: true })).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect.poll(() => calls).toBe(1);
  release();
  await expect(page.getByRole("heading", { name: "Orden creada" })).toBeVisible();
  await expect(page.getByText(/No vuelvas a publicarla/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver mi orden" })).toHaveAttribute("href", `/my-orders/${id}`);
});

test("optional invoice errors expand and sale clears the receiving destination", async ({ page }) => {
  await page.goto("/orders/new");
  await page.getByLabel("Monto fiat", { exact: true }).fill("100000");
  await conditions(page);
  await page.getByRole("checkbox", { name: "Nequi", exact: true }).check();
  await page.locator("summary").click();
  await page.getByRole("textbox", { name: "Invoice o Lightning Address", exact: true }).fill("invalid");
  await page.locator("summary").click();
  await page.getByRole("button", { name: "Revisar oferta", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Invoice o Lightning Address", exact: true })).toBeVisible();
  await expect(page.getByText(/Lightning Address válida/)).toBeVisible();
  await page.getByRole("button", { name: "Atrás", exact: true }).click();
  await page.getByRole("button", { name: "Vender BTC", exact: true }).click();
  await conditions(page);
  await expect(page.locator("summary")).toHaveCount(0);
  await page.getByRole("button", { name: "Atrás", exact: true }).click();
  await page.getByRole("button", { name: "Comprar BTC", exact: true }).click();
  await conditions(page);
  await page.locator("summary").click();
  await expect(page.getByRole("textbox", { name: "Invoice o Lightning Address", exact: true })).toHaveValue("");
});

test("server rejection and network loss preserve the draft and require new consent", async ({ page }) => {
  let offline = false;
  await page.route("**/api/orders", (route) => offline ? route.abort() : route.fulfill({ status: 409, json: { ok: false, error: { code: "MOSTRO_REJECTED", message: "Mostro rechazó la publicación." } } }));
  await page.goto("/orders/new");
  await page.getByLabel("Monto fiat", { exact: true }).fill("100000");
  await conditions(page);
  await page.getByRole("checkbox", { name: "Nequi", exact: true }).check();
  await review(page);
  await page.getByLabel(confirmLabel).check();
  await page.getByRole("button", { name: "Publicar orden", exact: true }).click();
  await expect(page.getByText("Mostro rechazó la publicación.")).toBeVisible();
  await expect(page.getByLabel(confirmLabel)).not.toBeChecked();
  offline = true;
  await page.getByLabel(confirmLabel).check();
  await page.getByRole("button", { name: "Publicar orden", exact: true }).click();
  await expect(page.getByText(/No pudimos confirmar si la orden se publicó/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar orden", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Editar operación" }).click();
  await expect(page.getByLabel("Monto fiat", { exact: true })).toHaveValue("100.000");
});

test("all wizard stages fit desktop and mobile with a collapsible preview", async ({ page }, testInfo) => {
  await page.goto("/orders/new");
  await page.getByLabel("Monto fiat", { exact: true }).fill("250000");
  for (let stage = 0; stage < 3; stage++) {
    for (const width of [1440, 820, 390, 320]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`create-step-${stage + 1}-${width}.png`), fullPage: true });
    }
    if (stage === 0) {
      const preview = page.getByRole("complementary", { name: "Vista previa de la oferta" });
      await preview.getByRole("button").click();
      await expect(preview.getByText("Tu oferta", { exact: true })).toBeVisible();
      await preview.getByRole("button").click();
      await conditions(page);
      await page.getByRole("checkbox", { name: "Nequi", exact: true }).check();
      await page.getByRole("checkbox", { name: "Bancolombia", exact: true }).check();
    } else if (stage === 1) await review(page);
  }
});
