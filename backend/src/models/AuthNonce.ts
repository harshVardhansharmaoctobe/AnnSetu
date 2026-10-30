import { Schema, model } from "mongoose";

const authNonceSchema = new Schema({
  address: { type: String, required: true, lowercase: true, index: true },
  nonce: { type: String, required: true, unique: true },
  message: { type: String, required: true },
  used: { type: Boolean, default: false },
  // TTL index: MongoDB deletes the document once expiresAt passes.
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const AuthNonce = model("AuthNonce", authNonceSchema);
