import { isAddress, parseEther } from "ethers";

export const ETH_RE = /^\d+(\.\d{1,18})?$/;

/** Parse a user-entered ETH amount to wei, or return an error message. */
export function parseEthInput(value: string, opts: { max?: bigint; label?: string } = {}): { wei: bigint; error: null } | { wei: null; error: string } {
  const label = opts.label ?? "Amount";
  const v = value.trim();
  if (!v) return { wei: null, error: `${label} is required` };
  if (!ETH_RE.test(v)) return { wei: null, error: `${label} must be a number like 0.05 (max 18 decimals)` };
  const wei = parseEther(v);
  if (wei <= 0n) return { wei: null, error: `${label} must be greater than zero` };
  if (opts.max !== undefined && wei > opts.max) return { wei: null, error: `${label} exceeds the maximum allowed` };
  return { wei, error: null };
}

export interface CampaignFormValues {
  title: string;
  description: string;
  beneficiary: string;
  verifier: string;
  target: string;
  endDate: string; // yyyy-mm-dd
  milestones: { description: string; amount: string }[];
}

export type CampaignFormErrors = Partial<Record<keyof Omit<CampaignFormValues, "milestones">, string>> & {
  milestones?: string;
  milestoneRows?: Record<number, { description?: string; amount?: string }>;
};

/** Mirrors the backend and contract rules so problems are caught before any gas is spent. */
export function validateCampaignForm(v: CampaignFormValues, ngoAddress?: string | null, now = new Date()): CampaignFormErrors {
  const errors: CampaignFormErrors = {};
  const title = v.title.trim();
  if (title.length < 5) errors.title = "Title must be at least 5 characters";
  else if (title.length > 120) errors.title = "Title must be at most 120 characters";

  const description = v.description.trim();
  if (description.length < 20) errors.description = "Description must be at least 20 characters";
  else if (description.length > 5000) errors.description = "Description must be at most 5000 characters";

  if (!isAddress(v.beneficiary.trim())) errors.beneficiary = "Enter a valid wallet address";
  if (!v.verifier) errors.verifier = "Select a verifier";
  else if (ngoAddress && v.verifier.toLowerCase() === ngoAddress.toLowerCase()) errors.verifier = "You cannot verify your own campaign";
  else if (v.verifier.toLowerCase() === v.beneficiary.trim().toLowerCase()) errors.verifier = "The verifier cannot be the beneficiary";

  const target = parseEthInput(v.target, { label: "Target" });
  if (target.error) errors.target = target.error;

  if (!v.endDate) errors.endDate = "Choose an end date";
  else {
    const end = new Date(`${v.endDate}T23:59:59`);
    if (Number.isNaN(end.getTime())) errors.endDate = "Invalid date";
    else if (end.getTime() <= now.getTime() + 60 * 60 * 1000) errors.endDate = "End date must be in the future";
  }

  if (v.milestones.length === 0) errors.milestones = "Add at least one milestone";
  else if (v.milestones.length > 20) errors.milestones = "At most 20 milestones";

  const rows: NonNullable<CampaignFormErrors["milestoneRows"]> = {};
  let total = 0n;
  let rowsValid = true;
  v.milestones.forEach((m, i) => {
    const d = m.description.trim();
    const rowErr: { description?: string; amount?: string } = {};
    if (d.length < 3) rowErr.description = "At least 3 characters";
    else if (d.length > 280) rowErr.description = "At most 280 characters";
    const amt = parseEthInput(m.amount, { label: "Amount" });
    if (amt.wei === null) rowErr.amount = amt.error;
    else total += amt.wei;
    if (rowErr.description || rowErr.amount) {
      rows[i] = rowErr;
      rowsValid = false;
    }
  });
  if (Object.keys(rows).length) errors.milestoneRows = rows;
  if (!errors.milestones && rowsValid && target.wei !== null && total !== target.wei) {
    errors.milestones = "Milestone allocations must add up exactly to the target";
  }
  return errors;
}

export const hasErrors = (e: CampaignFormErrors) => Object.keys(e).length > 0;

/** Sum of milestone amounts in wei (invalid rows count as 0). */
export function sumMilestones(milestones: { amount: string }[]): bigint {
  return milestones.reduce((s, m) => {
    const p = parseEthInput(m.amount);
    return s + (p.wei ?? 0n);
  }, 0n);
}

export const EVIDENCE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
} as const;

export function validateEvidenceFiles(files: File[], maxBytes = 10 * 1024 * 1024, maxFiles = 6): string | null {
  if (files.length === 0) return "Attach at least one photo, receipt or PDF";
  if (files.length > maxFiles) return `At most ${maxFiles} files per submission`;
  for (const f of files) {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    const allowed = (EVIDENCE_TYPES as Record<string, readonly string[]>)[f.type];
    if (!allowed || !allowed.includes(ext)) return `"${f.name}" is not an allowed type (JPG, PNG, WEBP or PDF)`;
    if (f.size > maxBytes) return `"${f.name}" is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`;
    if (f.size === 0) return `"${f.name}" is empty`;
  }
  return null;
}
