import { Schema, model } from "mongoose";

const indexerStateSchema = new Schema(
  {
    contractAddress: { type: String, required: true, unique: true },
    chainId: { type: Number, required: true },
    startBlock: { type: Number, required: true },
    startBlockHash: { type: String, required: true },
    lastBlock: { type: Number, required: true },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const IndexerState = model("IndexerState", indexerStateSchema);
