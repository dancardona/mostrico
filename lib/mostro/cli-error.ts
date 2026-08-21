import { AppError, type AppErrorCode } from "./types";

interface ErrorPresentation {
  code: AppErrorCode;
  title: string;
  message: string;
  hint?: string;
}

const cantDoReasons: Record<string, ErrorPresentation> = {
  InvalidTradeIndex: {
    code: "TRADE_INDEX_OUT_OF_SYNC",
    title: "Índice desincronizado",
    message: "Mostro rechazó la operación porque el índice local está desincronizado. La oferta no fue tomada.",
    hint: "Sincroniza el índice y vuelve a intentarlo."
  },
  NotAllowedByStatus: {
    code: "ACTION_NOT_ALLOWED",
    title: "Acción no disponible",
    message: "Mostro no permite realizar esta acción en el estado actual de la orden.",
    hint: "Actualiza los mensajes de la operación antes de intentarlo de nuevo."
  },
  InvalidOrderStatus: {
    code: "ACTION_NOT_ALLOWED",
    title: "Estado de orden incompatible",
    message: "El estado actual de la orden no admite esta acción.",
    hint: "Actualiza la operación para consultar su estado más reciente."
  },
  OrderAlreadyCanceled: {
    code: "ORDER_NOT_AVAILABLE",
    title: "Orden cancelada",
    message: "Esta orden ya fue cancelada y no admite más acciones."
  },
  NotFound: {
    code: "ORDER_NOT_AVAILABLE",
    title: "Orden no disponible",
    message: "Mostro no encuentra esta orden. Puede haber expirado, sido cancelada o tomada recientemente."
  },
  InvalidAmount: {
    code: "INVALID_AMOUNT",
    title: "Monto inválido",
    message: "Mostro rechazó el monto indicado."
  },
  OutOfRangeFiatAmount: {
    code: "INVALID_AMOUNT",
    title: "Monto fuera del rango",
    message: "El monto fiat está fuera de los límites permitidos por la oferta."
  },
  OutOfRangeSatsAmount: {
    code: "INVALID_AMOUNT",
    title: "Monto fuera del rango",
    message: "La cantidad de sats está fuera de los límites permitidos por la oferta."
  },
  InvalidInvoice: {
    code: "INVALID_INVOICE",
    title: "Invoice inválida",
    message: "Mostro rechazó la invoice Lightning porque es inválida o ya expiró."
  },
  InvalidPaymentRequest: {
    code: "INVALID_INVOICE",
    title: "Invoice no procesable",
    message: "Mostro no pudo procesar la invoice Lightning enviada."
  },
  PendingOrderExists: {
    code: "PENDING_ORDER_EXISTS",
    title: "Ya existe una orden pendiente",
    message: "Mostro detectó otra orden pendiente para esta identidad.",
    hint: "Espera a que termine o sea cancelada antes de crear otra."
  },
  PriceTooStale: {
    code: "PRICE_UNAVAILABLE",
    title: "Precio temporalmente no disponible",
    message: "Mostro no tiene una cotización suficientemente reciente para procesar la orden.",
    hint: "Vuelve a intentarlo cuando se actualice el precio."
  },
  TooManyRequests: {
    code: "RATE_LIMITED",
    title: "Demasiados intentos",
    message: "Mostro está limitando temporalmente las solicitudes.",
    hint: "Espera un momento antes de volver a intentarlo."
  },
  InvalidFiatCurrency: {
    code: "VALIDATION_ERROR",
    title: "Moneda no admitida",
    message: "Esta instancia de Mostro no admite la moneda fiat indicada."
  }
};

const authorizationReasons = ["InvalidSignature", "InvalidPubkey", "IsNotYourOrder", "IsNotYourDispute", "NotAuthorized"];
const validationReasons = [
  "InvalidPeer",
  "InvalidRating",
  "InvalidTextMessage",
  "InvalidOrderKind",
  "InvalidParameters",
  "InvalidPayload",
  "InvalidAction",
  "InvalidCashuToken",
  "InvalidMintUrl",
  "CashuSignatureMissing"
];
const unavailableActionReasons = [
  "DisputeTakenByAdmin",
  "DisputeCreationError",
  "InvalidDisputeStatus",
  "CashuEscrowNotLocked"
];

for (const reason of authorizationReasons) {
  cantDoReasons[reason] = {
    code: "NOT_AUTHORIZED",
    title: "Acción no autorizada",
    message: "Mostro rechazó esta acción para la identidad actual."
  };
}

for (const reason of validationReasons) {
  cantDoReasons[reason] = {
    code: "VALIDATION_ERROR",
    title: "Solicitud inválida",
    message: "Mostro rechazó uno de los datos enviados. Revisa la información e inténtalo de nuevo."
  };
}

for (const reason of unavailableActionReasons) {
  cantDoReasons[reason] = {
    code: "ACTION_NOT_ALLOWED",
    title: "Acción no disponible",
    message: "Mostro no permite esta acción en el estado actual."
  };
}

cantDoReasons.CashuMintUnavailable = {
  code: "NETWORK_ERROR",
  title: "Servicio Cashu no disponible",
  message: "Mostro no pudo comunicarse con el mint configurado."
};

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function asAppError(presentation: ErrorPresentation, reason?: string) {
  return new AppError(presentation.code, presentation.message, {
    title: presentation.title,
    hint: presentation.hint,
    reason
  });
}

export function parseCliError(output: string): AppError {
  const normalized = compact(output);
  const reason = Object.keys(cantDoReasons).find((candidate) => normalized.includes(compact(candidate)));
  if (reason) return asAppError(cantDoReasons[reason], reason);

  if (/resource not found/i.test(output)) {
    return asAppError(cantDoReasons.NotFound, "NotFound");
  }
  if (/invalid public key/i.test(output)) {
    return new AppError("MOSTRO_NOT_CONFIGURED", "MOSTRO_PUBKEY no es válido o no está configurado.", {
      title: "Configuración inválida"
    });
  }
  if (/timed?\s*out|no response received|relay.*(?:failed|error)|network error|connection refused/i.test(output)) {
    return new AppError("NETWORK_ERROR", "No fue posible obtener una respuesta de Mostro o de los relays.", {
      title: "Problema de conexión",
      hint: "Comprueba la conexión y vuelve a intentarlo."
    });
  }
  if (/cant\s*do|cantdo|action cannot be completed|unexpected response from mostro/i.test(output)) {
    return new AppError("MOSTRO_REJECTED", "Mostro rechazó la acción solicitada.", {
      title: "Acción rechazada",
      hint: "Actualiza el estado de la operación antes de volver a intentarlo."
    });
  }

  return new AppError("CLI_EXIT_ERROR", "mostro-cli no pudo completar la acción.", {
    title: "No se pudo completar la acción",
    hint: "Actualiza el estado y vuelve a intentarlo."
  });
}
