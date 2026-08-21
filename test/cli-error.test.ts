import { describe, expect, it } from "vitest";
import { parseCliError } from "@/lib/mostro/cli-error";

const startup = "Checking for legacy token columns... No legacy token columns found - database is up to date";

describe("mostro-cli error parser", () => {
  it("parses InvalidTradeIndex without exposing terminal output", () => {
    const error = parseCliError(`${startup} 🛒 Take Order Unexpected response from Mostro: Sending cantDo message to user for InvalidTradeIndex`);
    expect(error).toMatchObject({
      code: "TRADE_INDEX_OUT_OF_SYNC",
      message: expect.stringContaining("La oferta no fue tomada"),
      details: { title: "Índice desincronizado", reason: "InvalidTradeIndex" }
    });
    expect(error.message).not.toContain("Checking for legacy");
  });

  it("parses NotAllowedByStatus as an action unavailable for the current state", () => {
    const error = parseCliError(`${startup} ⚡ Add Lightning Invoice ═══ Unexpected response from Mostro: Sending cantDo message to user for NotAllowedByStatus`);
    expect(error).toMatchObject({
      code: "ACTION_NOT_ALLOWED",
      message: "Mostro no permite realizar esta acción en el estado actual de la orden.",
      details: {
        title: "Acción no disponible",
        reason: "NotAllowedByStatus",
        hint: expect.stringContaining("Actualiza los mensajes")
      }
    });
    expect(error.message).not.toContain("Add Lightning Invoice");
  });

  it("never returns unknown raw CLI output to the UI", () => {
    const error = parseCliError(`${startup}\nprivate diagnostic detail from an unknown dependency`);
    expect(error).toMatchObject({ code: "CLI_EXIT_ERROR", message: "mostro-cli no pudo completar la acción." });
    expect(JSON.stringify(error.details)).not.toContain("private diagnostic");
  });
});
