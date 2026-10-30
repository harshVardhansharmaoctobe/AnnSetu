import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/format";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full min-w-[560px] text-left text-sm", className)} {...props} />
    </div>
  );
}

export const THead = (props: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className="border-b border-slate-200 bg-slate-50/70 text-xs tracking-wide text-navy-500 uppercase" {...props} />
);
export const TBody = (props: HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y divide-slate-100" {...props} />;
export const TR = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("hover:bg-slate-50/60", className)} {...props} />
);
export const TH = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("px-4 py-2.5 font-medium", className)} {...props} />
);
export const TD = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-4 py-3 align-middle text-navy-800", className)} {...props} />
);
