import { clsx } from "clsx";
import { AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { formatAmountInput } from "@/lib/format";

export function PageHeader({ title, eyebrow = "Mostro / P2P", description, identifier, actions }: {
  title: string; eyebrow?: string; description?: React.ReactNode; identifier?: string; actions?: React.ReactNode;
}) {
  return <header className="ds-page-header"><div><p className="ds-eyebrow">{eyebrow}</p><h1 className="ds-page-title">{title}</h1>{description && <div className="ds-page-description">{description}</div>}{identifier && <p className="ds-page-id">{identifier}</p>}</div>{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}</header>;
}

export function Section({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={clsx("ds-section", className)} {...props} />;
}

export function DataField({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) {
  return <div className={clsx("ds-field", className)}><dt>{label}</dt><dd>{value === "" || value == null ? "No disponible" : value}</dd></div>;
}

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
  return <div className={clsx("min-w-0 rounded-md border border-line bg-panel p-5", className)} {...props} />;
}

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "ds-button",
        className
      )}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("ds-input", className)} {...props} />;
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
        className={clsx("ds-input", suffix && "pr-16", className)}
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
  return <textarea className={clsx("ds-input min-h-28", className)} {...props} />;
}

interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "neutral" | "warning" | "danger" | "ok";
}

export function Notice({ children, className, tone = "neutral", ...props }: NoticeProps) {
  const styles = {
    neutral: "border-line bg-panel text-muted",
    warning: "border-bitcoin/60 bg-[var(--surface-warning)] text-ink",
    danger: "border-danger/60 bg-[var(--surface-danger)] text-danger",
    ok: "border-accent/60 bg-[var(--surface-success)] text-accent"
  };
  return (
    <div className={clsx("min-w-0 border-l-2 p-4 text-[13px] leading-6 [overflow-wrap:anywhere]", styles[tone], className)} {...props}>
      {children}
    </div>
  );
}

export function MarkdownText({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children: content }) => <p className="mt-2 first:mt-0">{content}</p>,
        strong: ({ children: content }) => <strong className="font-semibold text-ink">{content}</strong>,
        ul: ({ children: content }) => <ul className="mt-2 list-disc space-y-1 pl-5">{content}</ul>,
        ol: ({ children: content }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{content}</ol>,
        code: ({ children: content }) => <code className="rounded bg-raised px-1 py-0.5 font-mono text-[0.9em]">{content}</code>
      }}
    >
      {children}
    </ReactMarkdown>
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
