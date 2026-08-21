import { clsx } from "clsx";
import { AlertTriangle } from "lucide-react";
import { formatAmountInput } from "@/lib/format";

export interface ApiErrorData {
  code: string;
  message: string;
  details?: {
    title?: string;
    hint?: string;
    reason?: string;
  };
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded border border-line bg-panel p-5 shadow-soft sm:p-6", className)} {...props} />;
}

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("focus-ring min-h-11 w-full rounded border border-line bg-paper px-3 py-2 text-ink placeholder:text-ink/35", className)} {...props} />;
}

interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  allowDecimals?: boolean;
  onValueChange: (value: string) => void;
  suffix?: string;
  value: string;
}

export function AmountInput({ allowDecimals = false, className, onValueChange, suffix, value, ...props }: AmountInputProps) {
  return (
    <div className="relative">
      <input
        className={clsx("focus-ring min-h-11 w-full rounded border border-line bg-paper px-3 py-2 text-ink placeholder:text-ink/35", suffix && "pr-20", className)}
        inputMode={allowDecimals ? "decimal" : "numeric"}
        value={value}
        onChange={(event) => {
          const formatted = formatAmountInput(event.target.value, allowDecimals);
          if (formatted !== undefined) onValueChange(formatted);
        }}
        {...props}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium uppercase text-ink/45">{suffix}</span>}
    </div>
  );
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx("focus-ring min-h-28 w-full rounded border border-line bg-paper px-3 py-2 text-ink placeholder:text-ink/35", className)} {...props} />;
}

interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "neutral" | "warning" | "danger" | "ok";
}

export function Notice({ children, className, tone = "neutral", ...props }: NoticeProps) {
  const styles = {
    neutral: "border-line bg-paper text-ink/75",
    warning: "border-bitcoin/40 bg-[#332b22] text-ink",
    danger: "border-danger/35 bg-[#38252a] text-[#ffaaa6]",
    ok: "border-accent/35 bg-[#253326] text-[#b8e86c]"
  };
  return (
    <div className={clsx("rounded border p-4 text-sm leading-6 sm:px-5 sm:py-4", styles[tone], className)} {...props}>
      {children}
    </div>
  );
}

export function ErrorNotice({ error, children }: { error: ApiErrorData; children?: React.ReactNode }) {
  return (
    <Notice tone="danger">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
        <div>
          <p className="font-semibold text-ink">{error.details?.title || "No se pudo completar la acción"}</p>
          <p className="mt-1">{error.message}</p>
          {error.details?.hint && <p className="mt-2 text-ink/75">{error.details.hint}</p>}
          {children}
        </div>
      </div>
    </Notice>
  );
}
