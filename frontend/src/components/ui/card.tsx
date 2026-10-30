import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-navy-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "navy",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "navy" | "emerald" | "blue" | "amber";
}) {
  const tones = {
    navy: "bg-navy-50 text-navy-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-accent-50 text-accent-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-navy-500 uppercase">{label}</p>
          <p className="mt-1.5 truncate text-xl font-semibold text-navy-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-navy-500">{hint}</p>}
        </div>
        {icon && <div className={cn("rounded-lg p-2", tones[tone])}>{icon}</div>}
      </div>
    </Card>
  );
}
