import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./types";

const messages: Record<string, string> = {
  CLI_NOT_FOUND: "No se encontró mostro-cli.",
  CLI_VERSION_UNSUPPORTED: "La versión de mostro-cli no parece compatible.",
  MOSTRO_NOT_CONFIGURED: "Falta configurar MOSTRO_PUBKEY.",
  RELAYS_NOT_CONFIGURED: "Falta configurar RELAYS.",
  CLI_TIMEOUT: "mostro-cli tardó demasiado en responder.",
  CLI_EXIT_ERROR: "mostro-cli devolvió un error.",
  CLI_OUTPUT_UNRECOGNIZED: "No pudimos interpretar la respuesta de mostro-cli.",
  INVALID_ORDER_ID: "El ID de la oferta no es válido.",
  INVALID_AMOUNT: "El monto no es válido.",
  INVALID_INVOICE: "La factura Lightning no es válida.",
  ORDER_NOT_FOUND: "No encontramos la oferta.",
  ORDER_NOT_AVAILABLE: "La oferta ya no está disponible.",
  TRADE_INDEX_OUT_OF_SYNC: "El índice local de operaciones está desincronizado.",
  ACTION_NOT_ALLOWED: "Esta acción no está disponible en el estado actual.",
  PENDING_ORDER_EXISTS: "Ya existe una orden pendiente.",
  PRICE_UNAVAILABLE: "El precio no está disponible temporalmente.",
  RATE_LIMITED: "Mostro está limitando temporalmente las solicitudes.",
  NOT_AUTHORIZED: "La identidad actual no puede realizar esta acción.",
  MOSTRO_REJECTED: "Mostro rechazó la acción solicitada.",
  NETWORK_ERROR: "Hubo un problema de red con Mostro o los relays.",
  MOSTRO_ERROR: "Mostro devolvió un error.",
  VALIDATION_ERROR: "Revisa los datos enviados."
};

export function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data });
}

export function fail(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: messages.VALIDATION_ERROR, details: error.flatten() } },
      { status: 400 }
    );
  }

  if (error instanceof AppError) {
    const status = error.code === "CLI_NOT_FOUND" || error.code === "PRICE_UNAVAILABLE" || error.code === "NETWORK_ERROR"
      ? 503
      : error.code === "ORDER_NOT_FOUND"
        ? 404
        : error.code === "RATE_LIMITED"
          ? 429
          : error.code === "NOT_AUTHORIZED"
            ? 403
            : ["ORDER_NOT_AVAILABLE", "TRADE_INDEX_OUT_OF_SYNC", "ACTION_NOT_ALLOWED", "PENDING_ORDER_EXISTS", "MOSTRO_REJECTED"].includes(error.code)
              ? 409
              : error.code.startsWith("INVALID") || error.code.endsWith("CONFIGURED") || error.code === "VALIDATION_ERROR"
                ? 400
                : 500;
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message || messages[error.code], details: error.details } },
      { status }
    );
  }

  return NextResponse.json(
    { ok: false, error: { code: "MOSTRO_ERROR", message: messages.MOSTRO_ERROR } },
    { status: 500 }
  );
}
