import { Schema, model, type InferSchemaType } from "mongoose";

export const REQUESTED_ROLES = ["DONOR", "NGO", "VERIFIER"] as const;

const userSchema = new Schema(
  {
    address: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    organization: { type: String, trim: true, maxlength: 120 },
    requestedRole: { type: String, enum: REQUESTED_ROLES, default: "DONOR" },
    isDemo: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
