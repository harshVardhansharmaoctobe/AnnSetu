import { Schema, model, type InferSchemaType } from "mongoose";

/** Verification record derived exclusively from MilestoneApproved / MilestoneRejected events. */
const verificationSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true },
    campaignId: { type: Number, required: true },
    milestoneId: { type: Number, required: true },
    verifier: { type: String, required: true, lowercase: true, index: true },
    decision: { type: String, enum: ["APPROVED", "REJECTED"], required: true },
    reason: { type: String, default: null },
    evidenceCID: { type: String, default: null },
    evidenceHash: { type: String, default: null },
    txHash: { type: String, required: true, lowercase: true },
    logIndex: { type: Number, required: true },
    blockNumber: { type: Number, required: true },
    decidedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

verificationSchema.index({ contractAddress: 1, txHash: 1, logIndex: 1 }, { unique: true });
verificationSchema.index({ contractAddress: 1, campaignId: 1, milestoneId: 1 });

export type VerificationDoc = InferSchemaType<typeof verificationSchema>;
export const Verification = model("Verification", verificationSchema);
