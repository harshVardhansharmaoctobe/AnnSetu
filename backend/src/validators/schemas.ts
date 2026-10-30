import { getAddress, isAddress, parseEther } from "ethers";
import { z } from "zod";
import { TX_HASH_RE } from "../utils/chain.js";

export const addressSchema = z
  .string({ required_error: "Address is required" })
  .trim()
  .refine((v) => isAddress(v), "Invalid Ethereum address")
  .transform((v) => getAddress(v).toLowerCase());

const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Invalid signature");

export const ethAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,18})?$/, "Enter an ETH amount like 0.05 (max 18 decimals)")
  .transform((v) => parseEther(v))
  .refine((v) => v > 0n, "Amount must be greater than zero");

export const nonceSchema = z.object({ address: addressSchema });

export const loginSchema = z.object({ address: addressSchema, signature: signatureSchema });

export const registerSchema = z.object({
  address: addressSchema,
  signature: signatureSchema,
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  organization: z.string().trim().max(120).optional(),
  requestedRole: z.enum(["DONOR", "NGO", "VERIFIER"]).default("DONOR"),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  organization: z.string().trim().max(120).optional(),
});

const milestoneSchema = z.object({
  description: z.string().trim().min(3, "Milestone description must be at least 3 characters").max(280),
  amountEth: ethAmountSchema,
});

/** Multipart text fields for a campaign draft; `milestones` arrives as a JSON string. */
export const campaignDraftSchema = z
  .object({
    title: z.string().trim().min(5, "Title must be at least 5 characters").max(120),
    description: z.string().trim().min(20, "Description must be at least 20 characters").max(5000),
    beneficiary: addressSchema,
    verifier: addressSchema,
    targetEth: ethAmountSchema,
    endDate: z.coerce.date({ invalid_type_error: "Invalid end date" }),
    milestones: z
      .string()
      .transform((s, ctx) => {
        try {
          return JSON.parse(s) as unknown;
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "milestones must be valid JSON" });
          return z.NEVER;
        }
      })
      .pipe(z.array(milestoneSchema).min(1, "Add at least one milestone").max(20, "At most 20 milestones")),
  })
  .superRefine((v, ctx) => {
    if (v.endDate.getTime() <= Date.now() + 60 * 60 * 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date must be at least one hour in the future" });
    }
    const total = v.milestones.reduce((sum, m) => sum + m.amountEth, 0n);
    if (total !== v.targetEth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["milestones"],
        message: "Milestone allocations must add up exactly to the campaign target",
      });
    }
  });

export const evidenceUploadSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
  milestoneId: z.coerce.number().int().nonnegative(),
  note: z.string().trim().max(1000).default(""),
});

export const syncTxSchema = z.object({ txHash: z.string().regex(TX_HASH_RE, "Invalid transaction hash") });

export const campaignIdParam = z.coerce.number().int().positive("Invalid campaign id");

export const listCampaignsQuery = z.object({
  ngo: addressSchema.optional(),
  verifier: addressSchema.optional(),
  q: z.string().trim().max(100).optional(),
  state: z.enum(["active", "ended", "all"]).optional(),
});

export const transactionsQuery = z.object({
  campaignId: z.coerce.number().int().positive().optional(),
  address: addressSchema.optional(),
  event: z.string().regex(/^[A-Za-z]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
