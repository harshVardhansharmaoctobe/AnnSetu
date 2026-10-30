import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format";

const variants = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 focus-visible:ring-navy-400",
  accent: "bg-accent-600 text-white hover:bg-accent-700 focus-visible:ring-accent-500",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-400",
  outline: "border border-slate-300 bg-white text-navy-900 hover:bg-slate-50 focus-visible:ring-navy-300",
  ghost: "text-navy-700 hover:bg-slate-100 focus-visible:ring-navy-300",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors",
        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

/** Styles for <Link> elements that should look like buttons. */
export const buttonClass = (variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md", className?: string) =>
  cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    variants[variant],
    sizes[size],
    className,
  );
