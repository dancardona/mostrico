import { spawn } from "node:child_process";
import { AppError, MostroCliRunner, RunResult } from "./types";
import { redactSensitive } from "./redact";

const maxOutputBytes = 2 * 1024 * 1024;
let queue = Promise.resolve();

function boundedAppend(current: string, chunk: Buffer) {
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next, "utf8") <= maxOutputBytes) return next;
  return next.slice(0, maxOutputBytes);
}

function createSafeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    LC_ALL: process.env.LC_ALL
  };

  for (const key of ["MOSTRO_PUBKEY", "RELAYS", "POW"]) {
    if (process.env[key]) env[key] = process.env[key];
  }

  return env;
}

export class SpawnMostroCliRunner implements MostroCliRunner {
  constructor(private executable = process.env.MOSTRO_CLI_PATH || "mostro-cli") {}

  run(args: readonly string[], options: { timeoutMs?: number; preserveInvoices?: boolean } = {}): Promise<RunResult> {
    const task = () => this.runNow(args, options);
    const scheduled = queue.then(task, task);
    queue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  private runNow(args: readonly string[], options: { timeoutMs?: number; preserveInvoices?: boolean }): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeoutMs = options.timeoutMs ?? 30_000;

      const child = spawn(this.executable, args, {
        shell: false,
        env: createSafeEnv(),
        stdio: ["ignore", "pipe", "pipe"]
      });

      const timer = setTimeout(() => {
        settled = true;
        child.kill("SIGTERM");
        reject(new AppError("CLI_TIMEOUT", "mostro-cli tardó demasiado en responder."));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout = boundedAppend(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = boundedAppend(stderr, chunk);
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (error.code === "ENOENT") {
          reject(new AppError("CLI_NOT_FOUND", "No se encontró mostro-cli."));
          return;
        }
        reject(new AppError("MOSTRO_ERROR", redactSensitive(error.message)));
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({
          exitCode: exitCode ?? 1,
          stdout: redactSensitive(stdout, { preserveInvoices: options.preserveInvoices }),
          stderr: redactSensitive(stderr, { preserveInvoices: options.preserveInvoices }),
          durationMs: Date.now() - startedAt
        });
      });
    });
  }
}

export function getRunner(): MostroCliRunner {
  if (process.env.MOSTRO_WEB_MOCK_CLI === "1") {
    return new MockMostroCliRunner();
  }
  return new SpawnMostroCliRunner();
}

class MockMostroCliRunner implements MostroCliRunner {
  async run(args: readonly string[]): Promise<RunResult> {
    const command = args[0];
    const orderId = args[args.indexOf("-o") + 1] || "11111111-1111-4111-8111-111111111111";
    const kind = args[args.indexOf("-k") + 1] || "sell";
    const createdOrderId = kind === "buy"
      ? "33333333-3333-4333-8333-333333333333"
      : "44444444-4444-4444-8444-444444444444";
    const stdoutByCommand: Record<string, string> = {
      "--version": "mostro-cli 0.16.0\n",
      listorders:
        "ID                                   Kind Currency Amount     Sats    Premium Payment methods Status\n" +
        "11111111-1111-4111-8111-111111111111 sell COP      50000-150000 100000  1.5     Nequi,Daviplata  active\n",
      ordersinfo:
        `order_id: ${orderId}\nkind: sell\ncurrency: COP\nmin_amount: 50000\nmax_amount: 150000\nsats: 100000\npremium: 1.5\npayment_methods: Nequi, Daviplata\nstatus: active\n`,
      takesell: `Trade started for order ${orderId}. Add invoice if needed.\n`,
      neworder: kind === "sell"
        ? `Payment Invoice Received\nOrder ID: ${createdOrderId}\nLIGHTNING INVOICE TO PAY:\nlnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka\nOrder saved successfully!\n`
        : `New Order Created\nOrder ID: ${createdOrderId}\nKind: Buy\nStatus: Pending\nOrder saved successfully!\n`,
      getlasttradeindex: "Trade index synchronized successfully!\n",
      addinvoice: `Invoice added for order ${orderId}.\n`,
      getdm:
        `2026-08-21T14:00:00Z ${orderId} mostro order taken\n` +
        `2026-08-21T14:01:00Z ${orderId} mostro sats locked; review seller payment instructions before sending fiat\n`,
      fiatsent: `Fiat sent marked for order ${orderId}.\n`,
      rate: `Rating submitted for order ${orderId}.\n`,
      dispute: `Dispute opened for order ${orderId}.\n`,
      cancel: `Order ${orderId} canceled successfully.\n`,
      release: `Sats released for order ${orderId}.\n`
    };
    return {
      exitCode: 0,
      stdout: stdoutByCommand[command] ?? "ok\n",
      stderr: "",
      durationMs: 5
    };
  }
}
