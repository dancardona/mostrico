import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/);

export const amountSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/, "Monto fiat inválido")
  .refine((value) => Number(value) > 0 && Number.isFinite(Number(value)), "Monto fiat inválido");

const wholeAmountSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, "El monto debe ser un número entero positivo")
  .refine((value) => Number.isSafeInteger(Number(value)), "El monto es demasiado grande");

const satsAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "La cantidad de sats debe ser un número entero")
  .refine((value) => BigInt(value) <= 2_100_000_000_000_000n, "La cantidad de sats es demasiado grande");

const fiatRangeSchema = z.string().trim().regex(/^[1-9]\d*-[1-9]\d*$/, "Rango fiat inválido").superRefine((value, context) => {
  const [minimum, maximum] = value.split("-").map(Number);
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum >= maximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "El mínimo debe ser menor que el máximo" });
  }
});

const paymentMethodSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[^\u0000-\u001f\u007f]+$/, "Método de pago inválido");

const lightningAddressSchema = z
  .string()
  .trim()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Lightning Address inválida");

export const ratingSchema = z.number().int().min(1).max(5);

export const relayListSchema = z
  .string()
  .optional()
  .default("")
  .transform((value) => value.split(",").map((relay) => relay.trim()).filter(Boolean))
  .refine((relays) => relays.every((relay) => {
    try {
      const url = new URL(relay);
      return url.protocol === "wss:";
    } catch {
      return false;
    }
  }), "Los relays deben usar wss://");

export const mostroPubkeySchema = z
  .string()
  .trim()
  .refine((value) => /^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/i.test(value) || /^[0-9a-f]{64}$/i.test(value), {
    message: "MOSTRO_PUBKEY debe ser npub o hex de 64 caracteres"
  });

export const invoiceSchema = z
  .string()
  .trim()
  .min(20)
  .max(4096)
  .regex(/^(?:lnbc|lntb|lnbcrt)[a-z0-9]+$/i, "Factura Lightning inválida");

export const listOrdersInputSchema = z.object({
  currency: currencySchema.default("COP")
});

export const takeSellInputSchema = z.object({
  orderId: uuidSchema,
  fiatAmount: amountSchema.optional(),
  invoice: invoiceSchema.optional(),
  confirmed: z.literal(true)
});

export const addInvoiceInputSchema = z.object({
  orderId: uuidSchema,
  invoice: invoiceSchema
});

export const newOrderInputSchema = z.object({
  kind: z.enum(["buy", "sell"]),
  currency: currencySchema.default("COP"),
  fiatAmount: z.union([wholeAmountSchema, fiatRangeSchema]),
  satsAmount: satsAmountSchema.default("0"),
  paymentMethods: z.array(paymentMethodSchema).min(1).max(5),
  premium: z.number().int().min(-99).max(100).default(0),
  invoice: z.union([invoiceSchema, lightningAddressSchema]).optional(),
  expirationDays: z.number().int().min(0).max(90).default(0),
  confirmed: z.literal(true)
}).superRefine((value, context) => {
  if (value.kind === "sell" && value.invoice) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["invoice"], message: "Una orden sell no recibe invoice de cobro" });
  }
});

export type NewOrderInput = z.infer<typeof newOrderInputSchema>;

export const sinceSchema = z.coerce.number().int().min(1).max(1440).default(30);

export const fiatSentInputSchema = z.object({
  confirmedActualFiatTransfer: z.literal(true)
});

export const disputeInputSchema = z.object({
  confirmed: z.literal(true)
});

export const cancelOrderInputSchema = z.object({
  confirmed: z.literal(true)
});

export const releaseOrderInputSchema = z.object({
  confirmedFiatReceived: z.literal(true)
});
