import { Schema, model, type InferSchemaType } from "mongoose";

const storedObjectSchema = new Schema(
  {
    ref: { type: String, required: true }, // IPFS CID or local://sha256-<hex>
    provider: { type: String, enum: ["pinata", "kubo", "local"], required: true },
    sha256: { type: String, required: true },
    mime: { type: String },
    size: { type: Number },
    name: { type: String },
  },
  { _id: false },
);

const draftMilestoneSchema = new Schema(
  { description: { type: String, required: true }, amountWei: { type: String, required: true } },
  { _id: false },
);

/** Snapshot of on-chain milestone state (refreshed from contract reads; display cache only). */
const chainMilestoneSchema = new Schema(
  {
    id: Number,
    description: String,
    allocatedAmount: String,
    evidenceCID: String,
    evidenceHash: String,
    status: Number,
    rejectionReason: String,
    submittedAt: Number,
    reviewedAt: Number,
    releasedAt: Number,
  },
  { _id: false },
);

const chainSnapshotSchema = new Schema(
  {
    ngo: String,
    beneficiary: String,
    verifier: String,
    title: String,
    metadataCID: String,
    targetAmount: String,
    totalAllocated: String,
    totalDonated: String,
    totalReleased: String,
    deadline: Number,
    createdAt: Number,
    milestoneCount: Number,
    active: Boolean,
    suspended: Boolean,
    milestones: [chainMilestoneSchema],
    syncedAt: Date,
    syncedBlock: Number,
  },
  { _id: false },
);

const campaignSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true, index: true },
    campaignId: { type: Number, default: null }, // on-chain id once created
    status: { type: String, enum: ["DRAFT", "ONCHAIN"], default: "DRAFT", index: true },

    ngoAddress: { type: String, required: true, lowercase: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    coverImage: { type: storedObjectSchema, default: null },
    beneficiary: { type: String, lowercase: true },
    verifier: { type: String, lowercase: true },
    targetWei: { type: String },
    endDate: { type: Date },
    milestones: { type: [draftMilestoneSchema], default: [] },

    metadata: { type: storedObjectSchema, default: null },
    metadataAvailable: { type: Boolean, default: true },

    createdTxHash: { type: String, default: null },
    createdBlock: { type: Number, default: null },
    chain: { type: chainSnapshotSchema, default: null },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

campaignSchema.index(
  { contractAddress: 1, campaignId: 1 },
  { unique: true, partialFilterExpression: { campaignId: { $type: "number" } } },
);
campaignSchema.index({ contractAddress: 1, "metadata.ref": 1 });

export type CampaignDoc = InferSchemaType<typeof campaignSchema>;
export const Campaign = model("Campaign", campaignSchema);
