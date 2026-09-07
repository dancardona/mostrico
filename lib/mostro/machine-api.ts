import { z } from "zod";

const machineErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({
    schema_version: z.literal(1),
    ok: z.literal(true),
    data: z.unknown()
  }),
  z.object({
    schema_version: z.literal(1),
    ok: z.literal(false),
    error: machineErrorSchema
  })
]);

export const machineCapabilitiesSchema = z.object({
  api_version: z.number().int().positive(),
  cli_version: z.string().min(1),
  features: z.array(z.string().min(1))
});

export const machineTradeStatusSchema = z.object({
  order_id: z.string().uuid(),
  status: z.string().min(1),
  kind: z.enum(["buy", "sell"]).nullable(),
  fiat_code: z.string().min(1).nullable(),
  is_mine: z.boolean(),
  restored_stub: z.boolean()
});

export const machineFiatSentSchema = z.object({
  action: z.literal("fiat-sent"),
  acknowledged_action: z.literal("fiat-sent-ok"),
  already_acknowledged: z.boolean(),
  order_id: z.string().uuid(),
  status: z.literal("fiat-sent")
});

const restoredOrderSchema = z.object({
  order_id: z.string().uuid(),
  trade_index: z.number().int().nonnegative(),
  status: z.string().min(1)
});

const restoredDisputeSchema = z.object({
  dispute_id: z.string().uuid(),
  order_id: z.string().uuid(),
  trade_index: z.number().int().nonnegative(),
  status: z.string().min(1)
}).passthrough();

export const machineRestoreSchema = z.object({
  persisted: z.object({
    orders: z.number().int().nonnegative(),
    disputes: z.number().int().nonnegative()
  }),
  orders: z.array(restoredOrderSchema),
  disputes: z.array(restoredDisputeSchema)
});

export type MachineApiEnvelope<T> =
  | { schemaVersion: 1; ok: true; data: T }
  | { schemaVersion: 1; ok: false; error: z.infer<typeof machineErrorSchema> };

export function parseMachineApiEnvelope<T>(
  stdout: string,
  dataSchema: z.ZodType<T>
): MachineApiEnvelope<T> | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout.trim());
  } catch {
    return undefined;
  }

  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return undefined;
  if (!envelope.data.ok) {
    return { schemaVersion: 1, ok: false, error: envelope.data.error };
  }

  const data = dataSchema.safeParse(envelope.data.data);
  if (!data.success) return undefined;
  return { schemaVersion: 1, ok: true, data: data.data };
}
