import { Schema, model, type InferSchemaType } from "mongoose";

/** One decoded TrustChain log. Written only by the indexer from logs fetched from the RPC. */
const chainEventSchema = new Schema(
  {
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true },
    txHash: { type: String, required: true, lowercase: true },
    logIndex: { type: Number, required: true },
    blockNumber: { type: Number, required: true },
    blockTimestamp: { type: Date, required: true },
    event: { type: String, required: true },
    campaignId: { type: Number, default: null },
    milestoneId: { type: Number, default: null },
    actor: { type: String, lowercase: true, default: null }, // donor / ngo / verifier / admin / releaser
    subject: { type: String, lowercase: true, default: null }, // registered account, beneficiary...
    amountWei: { type: String, default: null },
    args: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "indexedAt", updatedAt: false } },
);

chainEventSchema.index({ contractAddress: 1, txHash: 1, logIndex: 1 }, { unique: true });
chainEventSchema.index({ contractAddress: 1, campaignId: 1, blockNumber: -1, logIndex: -1 });
chainEventSchema.index({ contractAddress: 1, actor: 1, event: 1 });
chainEventSchema.index({ contractAddress: 1, event: 1, blockNumber: -1 });

export type ChainEventDoc = InferSchemaType<typeof chainEventSchema>;
export const ChainEvent = model("ChainEvent", chainEventSchema);
