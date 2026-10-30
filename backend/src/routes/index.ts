import { Router } from "express";
import * as admin from "../controllers/adminController.js";
import * as auth from "../controllers/authController.js";
import * as campaigns from "../controllers/campaignController.js";
import * as chain from "../controllers/chainController.js";
import * as evidence from "../controllers/evidenceController.js";
import * as verification from "../controllers/verificationController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { env } from "../config/env.js";

export const api = Router();

// Authentication (wallet signature → JWT)
api.post("/auth/nonce", auth.nonce);
api.post("/auth/register", auth.register);
api.post("/auth/login", auth.login);
api.get("/auth/me", requireAuth, auth.me);
api.patch("/auth/me", requireAuth, auth.updateMe);

// Campaigns
api.get("/campaigns", campaigns.list);
api.get("/campaigns/mine", requireAuth, requireRole("NGO"), campaigns.mine);
api.post("/campaigns/drafts", requireAuth, requireRole("NGO"), upload.single("cover"), campaigns.createDraft);
api.get("/campaigns/drafts/:draftId", requireAuth, requireRole("NGO"), campaigns.getDraft);
api.get("/campaigns/:id", campaigns.detail);
api.get("/campaigns/:id/events", campaigns.events);

// Evidence
api.post("/evidence", requireAuth, requireRole("NGO"), upload.array("files", env.MAX_FILES_PER_UPLOAD), evidence.upload);
api.get("/evidence", evidence.list);
api.get("/evidence/validate-cid/:cid", evidence.validateCid);
api.get("/evidence/:id", evidence.get);
api.get("/evidence/:id/integrity", evidence.integrity);

// Verification
api.get("/verifications/pending", requireAuth, requireRole("VERIFIER"), verification.pending);
api.get("/verifications/awaiting-release", requireAuth, requireRole("VERIFIER"), verification.awaitingRelease);
api.get("/verifications/history", verification.history);

// Blockchain index
api.get("/chain/config", chain.config);
api.get("/chain/status", chain.status);
api.post("/chain/sync-tx", chain.syncTx);
api.get("/chain/transactions", chain.transactions);
api.get("/chain/tx/:hash", chain.tx);
api.get("/donations", chain.donations);

// Directory (public)
api.get("/directory/ngos", admin.authorizedNgos);
api.get("/directory/verifiers", admin.authorizedVerifiers);
api.get("/users/:address", admin.userProfile);

// Admin
api.get("/admin/overview", requireAuth, requireRole("ADMIN"), admin.overview);
api.get("/admin/applications", requireAuth, requireRole("ADMIN"), admin.applications);
api.get("/admin/users", requireAuth, requireRole("ADMIN"), admin.users);

// Local development storage (NOT IPFS)
api.get("/storage/local/:sha256", admin.localFile);
