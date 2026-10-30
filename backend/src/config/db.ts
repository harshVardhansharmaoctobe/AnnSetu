import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

export async function connectDb(uri: string): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info("db", `Connected to MongoDB (${mongoose.connection.name})`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export const isDbConnected = () => mongoose.connection.readyState === 1;
