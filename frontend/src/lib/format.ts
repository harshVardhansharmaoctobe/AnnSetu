import { formatEther } from "ethers";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Format a wei amount (decimal string or bigint) as ETH, trimming to `maxDecimals`. */
export function formatEth(wei: string | bigint | null | undefined, maxDecimals = 4): string {
  if (wei === null || wei === undefined || wei === "") return "—";
  const value = formatEther(typeof wei === "bigint" ? wei : BigInt(wei));
  const [whole, frac = ""] = value.split(".");
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, "");
  const small = trimmed === "" && /[1-9]/.test(frac);
  if (small) return `<0.${"0".repeat(maxDecimals - 1)}1 ETH`;
  return `${Number(whole).toLocaleString("en-US")}${trimmed ? `.${trimmed}` : ""} ETH`;
}

export const shortAddress = (address?: string | null, chars = 4) =>
  address ? `${address.slice(0, 2 + chars)}…${address.slice(-chars)}` : "—";

export const shortHash = (hash?: string | null) => (hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "—");

export function formatDate(value?: string | number | Date | null, withTime = false) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function relativeTime(value?: string | number | Date | null) {
  if (!value) return "—";
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** Percentage of `part` over `whole` (wei strings), clamped to 0–100. */
export function percent(part: string | bigint, whole: string | bigint): number {
  const w = BigInt(whole);
  if (w === 0n) return 0;
  const p = (BigInt(part) * 10000n) / w;
  return Math.min(100, Math.max(0, Number(p) / 100));
}

/** Wei string → JS number of ETH, for charts only (never for accounting). */
export const weiToEthNumber = (wei: string | bigint) => Number(formatEther(typeof wei === "bigint" ? wei : BigInt(wei)));

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const sameAddress = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
