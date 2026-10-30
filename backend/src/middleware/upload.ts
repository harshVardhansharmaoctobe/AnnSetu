import multer from "multer";
import { env } from "../config/env.js";

/** Files are kept in memory only long enough to validate, hash and forward them to storage. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: env.MAX_FILES_PER_UPLOAD,
    fields: 20,
    fieldSize: 64 * 1024,
  },
});
