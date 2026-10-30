import { Schema, model, type InferSchemaType } from "mongoose";

export const EVIDENCE_STATUSES = ["UPLOADED", "SUBMITTED", "APPROVED", "REJECTED", "RELEASED", "SUPERSEDED"] as const;

const evidenceFileSchema = new Schema(
  {
    name: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    ref: { type: String, required: true },
    provider: { type: String, required: true },
  },
  { _id: false },
);

const evidenceSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true, index: true },
    campaignId: { type: Number, required: true },
    milestoneId: { type: Number, required: true },
    ngoAddress: { type: String, required: true, lowercase: true },
    note: { type: String, default: "" },
    files: { type: [evidenceFileSchema], default: [] },
    provider: { type: String, enum: ["pinata", "kubo", "local"], required: true },
    manifestRef: { type: String, required: true }, // IPFS CID (or local:// ref) submitted on-chain
    manifestSha256: { type: String, required: true }, // 0x-prefixed bytes32 submitted on-chain
    status: { type: String, enum: EVIDENCE_STATUSES, default: "UPLOADED", index: true },
    submitTxHash: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    reviewTxHash: { type: String, default: null },
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true },
);

evidenceSchema.index({ contractAddress: 1, campaignId: 1, milestoneId: 1, createdAt: -1 });
evidenceSchema.index({ contractAddress: 1, manifestRef: 1, manifestSha256: 1 });

export type EvidenceDoc = InferSchemaType<typeof evidenceSchema>;
export const Evidence = model("Evidence", evidenceSchema);
