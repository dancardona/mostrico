export type OrderKind = "sell" | "buy";
export type OrderStatus = string;

export interface MostroOrder {
  id: string;
  kind: OrderKind;
  currency: string;
  fiatAmount?: string;
  minFiatAmount?: string;
  maxFiatAmount?: string;
  sats?: number;
  premiumPct?: number;
  paymentMethods: string[];
  status?: OrderStatus;
  createdAt?: string;
  listedAt?: string;
  verification?: "verified" | "unverified";
  verificationMessage?: string;
  makerPubkey?: string;
  reputation?: {
    rating?: number;
    trades?: number;
  };
  rawFields?: Record<string, string>;
}

export interface TradeMessage {
  id?: string;
  orderId?: string;
  type?: string;
  timestamp?: string;
  text: string;
  source: "mostro" | "counterparty" | "unknown";
}

export interface ChatMessage {
  id: string;
  direction: "incoming" | "outgoing";
  text: string;
  timestamp: string;
}

export type LocalTradeStep =
  | "maker_pending"
  | "taken"
  | "waiting_for_bond"
  | "needs_invoice"
  | "waiting_for_lock"
  | "waiting_for_fiat"
  | "ready_for_fiat"
  | "fiat_marked_sent"
  | "waiting_release"
  | "completed"
  | "canceled"
  | "disputed"
  | "unknown";

export interface LocalTradeMetadata {
  createdAt: string;
  currency: string;
  role?: "maker" | "taker";
  kind?: OrderKind;
  selectedFiatAmount?: string;
  satsAmount?: string;
  paymentMethods?: string[];
  premiumPct?: number;
  expirationDays?: number;
  counterpartyPubkey?: string;
  chatMessages?: ChatMessage[];
  lastKnownStep: LocalTradeStep;
}

export interface CreatedOrderResult {
  orderId: string;
  kind: OrderKind;
  paymentInvoice?: string;
  message: string;
  partial: boolean;
}

export interface TakeSellResult {
  orderId: string;
  message: string;
  invoiceAdded: boolean;
  bondInvoice?: string;
  nextStep: "pay_bond" | "add_invoice" | "waiting_for_seller";
}

export interface TakeBuyResult {
  orderId: string;
  message: string;
  paymentInvoice?: string;
  bondInvoice?: string;
  nextStep: "pay_bond" | "pay_invoice" | "waiting_for_lock";
}

export interface TradeLifecycleStatus {
  step: LocalTradeStep;
  kind?: OrderKind;
  role?: "maker" | "taker";
  bondRequired: boolean;
  bondInvoice?: string;
  paymentInvoice?: string;
  readyForInvoice: boolean;
}

export interface Diagnostics {
  cliFound: boolean;
  cliVersion?: string;
  supported: boolean;
  mostroConfigured: boolean;
  relayCount: number;
  connection?: "ok" | "error" | "unknown";
  warnings: string[];
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface MostroCliRunner {
  run(args: readonly string[], options?: {
    timeoutMs?: number;
    preserveInvoices?: boolean;
    preservePeerPubkeys?: boolean;
  }): Promise<RunResult>;
}

export type AppErrorCode =
  | "CLI_NOT_FOUND"
  | "CLI_VERSION_UNSUPPORTED"
  | "MOSTRO_NOT_CONFIGURED"
  | "RELAYS_NOT_CONFIGURED"
  | "CLI_TIMEOUT"
  | "CLI_EXIT_ERROR"
  | "CLI_OUTPUT_UNRECOGNIZED"
  | "INVALID_ORDER_ID"
  | "INVALID_AMOUNT"
  | "INVALID_INVOICE"
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_AVAILABLE"
  | "TRADE_INDEX_OUT_OF_SYNC"
  | "ACTION_NOT_ALLOWED"
  | "PENDING_ORDER_EXISTS"
  | "PRICE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "NOT_AUTHORIZED"
  | "MOSTRO_REJECTED"
  | "NETWORK_ERROR"
  | "MOSTRO_ERROR"
  | "VALIDATION_ERROR";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
