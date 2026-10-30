import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { Button } from "./button";

const alertTones: Record<string, { box: string; icon: LucideIcon }> = {
  info: { box: "border-accent-100 bg-accent-50 text-accent-700", icon: Info },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  error: { box: "border-rose-200 bg-rose-50 text-rose-800", icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: "info" | "success" | "warning" | "error";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const { box, icon: Icon } = alertTones[tone];
  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", box, className)} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "break-words opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-12 text-sm text-navy-500", className)} role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="rounded-full bg-slate-100 p-3 text-navy-400">
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="mt-3 font-medium text-navy-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-navy-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: Error | string; onRetry?: () => void; className?: string }) {
  const message = typeof error === "string" ? error : error.message;
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)} role="alert">
      <div className="rounded-full bg-rose-50 p-3 text-rose-600">
        <XCircle className="size-6" aria-hidden />
      </div>
      <p className="mt-3 font-medium text-navy-900">Something went wrong</p>
      <p className="mt-1 max-w-md text-sm break-words text-navy-500">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

export function ProgressBar({ value, tone = "emerald", className }: { value: number; tone?: "emerald" | "blue" | "navy"; className?: string }) {
  const colors = { emerald: "bg-emerald-500", blue: "bg-accent-500", navy: "bg-navy-700" };
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", colors[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
