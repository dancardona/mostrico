import { describe, expect, it } from "vitest";
import {
  machineCapabilitiesSchema,
  machineFiatSentSchema,
  parseMachineApiEnvelope
} from "@/lib/mostro/machine-api";

const orderId = "11111111-1111-4111-8111-111111111111";

describe("mostro-cli machine API", () => {
  it("parses a versioned capabilities envelope", () => {
    const envelope = parseMachineApiEnvelope(JSON.stringify({
      schema_version: 1,
      ok: true,
      data: {
        api_version: 1,
        cli_version: "0.16.1",
        features: ["fiat-sent", "restore-persist"]
      }
    }), machineCapabilitiesSchema);

    expect(envelope).toMatchObject({
      ok: true,
      data: { api_version: 1, features: ["fiat-sent", "restore-persist"] }
    });
  });

  it("preserves a structured error even when the command exits non-zero", () => {
    const envelope = parseMachineApiEnvelope(JSON.stringify({
      schema_version: 1,
      ok: false,
      error: { code: "MOSTRO_REJECTED", message: "FiatSent was rejected" }
    }), machineFiatSentSchema);

    expect(envelope).toEqual({
      schemaVersion: 1,
      ok: false,
      error: { code: "MOSTRO_REJECTED", message: "FiatSent was rejected" }
    });
  });

  it("rejects human output and a success payload without FiatSentOk", () => {
    expect(parseMachineApiEnvelope("Fiat sent marked", machineFiatSentSchema)).toBeUndefined();
    expect(parseMachineApiEnvelope(JSON.stringify({
      schema_version: 1,
      ok: true,
      data: { action: "fiat-sent", already_acknowledged: false, order_id: orderId, status: "fiat-sent" }
    }), machineFiatSentSchema)).toBeUndefined();
  });
});
