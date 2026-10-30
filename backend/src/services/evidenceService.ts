import path from "node:path";
import { contractScope } from "../config/chain.js";
import { Evidence } from "../models/Evidence.js";
import { HttpError, badRequest, conflict, forbidden, notFound, unavailable } from "../utils/errors.js";
import { MilestoneStatusCode, sameAddress, sha256Hex } from "../utils/chain.js";
import { readOnChainCampaign, serializeEvidence } from "./campaignService.js";
import { fetchStored, uploadBuffer, uploadJson } from "./ipfsService.js";

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED: Record<string, { mimes: string[]; magic: (b: Buffer) => boolean }> = {
  ".jpg": { mimes: ["image/jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".jpeg": { mimes: ["image/jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".png": { mimes: ["image/png"], magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  ".webp": {
    mimes: ["image/webp"],
    magic: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  ".pdf": { mimes: ["application/pdf"], magic: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
};
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
export const EVIDENCE_EXTENSIONS = Object.keys(ALLOWED);

/** Extension, declared MIME type and file signature must all agree. */
export function validateFile(file: UploadedFile, allowedExtensions = EVIDENCE_EXTENSIONS) {
  const ext = path.extname(file.originalname).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule || !allowedExtensions.includes(ext)) {
    throw badRequest(`"${file.originalname}": file type not allowed (allowed: ${allowedExtensions.join(", ")})`);
  }
  if (!rule.mimes.includes(file.mimetype)) {
    throw badRequest(`"${file.originalname}": MIME type ${file.mimetype} does not match ${ext}`);
  }
  if (file.size === 0 || !rule.magic(file.buffer)) {
    throw badRequest(`"${file.originalname}": file content is not a valid ${ext.slice(1).toUpperCase()}`);
  }
  // Keep names printable and short; the hash, not the name, identifies the file.
  return { ext, safeName: path.basename(file.originalname).replace(/[^\w.\- ]+/g, "_").slice(0, 120) };
}

export async function uploadEvidence(
  ngoAddress: string,
  input: { campaignId: number; milestoneId: number; note: string },
  files: UploadedFile[],
) {
  if (files.length === 0) throw badRequest("Attach at least one evidence file (photo, receipt or PDF document)");

  // Authorisation and state come from the contract, not from MongoDB.
  let onChain;
  try {
    onChain = await readOnChainCampaign(input.campaignId);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw unavailable("Blockchain is unavailable — cannot verify the campaign right now");
  }
  if (!sameAddress(onChain.campaign.ngo, ngoAddress)) throw forbidden("Only the campaign's NGO can upload evidence");
  const milestone = onChain.milestones[input.milestoneId];
  if (!milestone) throw notFound(`Milestone ${input.milestoneId} does not exist in campaign #${input.campaignId}`);
  const status = Number(milestone.status);
  if (status !== MilestoneStatusCode.Pending && status !== MilestoneStatusCode.Rejected) {
    throw conflict("Evidence can only be submitted for milestones that are awaiting evidence or were rejected");
  }

  const prepared = files.map((f) => ({ file: f, ...validateFile(f) }));
  const stored = [];
  for (const { file, safeName } of prepared) {
    const obj = await uploadBuffer(file.buffer, safeName, file.mimetype);
    stored.push({ name: safeName, mime: file.mimetype, size: file.size, sha256: obj.sha256, ref: obj.ref, provider: obj.provider });
  }

  const { contractAddress, chainId } = contractScope();
  const manifest = {
    schema: "trustchain.evidence.v1",
    chainId,
    contract: contractAddress,
    campaignId: input.campaignId,
    milestoneId: input.milestoneId,
    milestoneDescription: milestone.description,
    ngo: ngoAddress,
    note: input.note,
    files: stored.map(({ name, mime, size, sha256, ref }) => ({ name, mime, size, sha256, ref })),
    createdAt: new Date().toISOString(),
  };
  const { stored: manifestObj, data } = await uploadJson(manifest, `evidence-c${input.campaignId}-m${input.milestoneId}.json`);
  const manifestSha256 = `0x${sha256Hex(data)}`;

  const doc = await Evidence.create({
    chainId,
    contractAddress,
    campaignId: input.campaignId,
    milestoneId: input.milestoneId,
    ngoAddress,
    note: input.note,
    files: stored,
    provider: manifestObj.provider,
    manifestRef: manifestObj.ref,
    manifestSha256,
    status: "UPLOADED",
  });
  return serializeEvidence(doc.toObject());
}

export async function listEvidence(filter: { campaignId?: number; milestoneId?: number; ngo?: string }) {
  const q: Record<string, unknown> = { contractAddress: contractScope().contractAddress };
  if (filter.campaignId !== undefined) q.campaignId = filter.campaignId;
  if (filter.milestoneId !== undefined) q.milestoneId = filter.milestoneId;
  if (filter.ngo) q.ngoAddress = filter.ngo;
  const docs = await Evidence.find(q).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map(serializeEvidence);
}

export async function getEvidence(id: string) {
  const doc = await Evidence.findOne({ _id: id, contractAddress: contractScope().contractAddress })
    .lean()
    .catch(() => null);
  if (!doc) throw notFound("Evidence not found");
  return serializeEvidence(doc);
}

/**
 * Re-download the manifest and every file, recompute SHA-256 and compare with the hash recorded
 * on-chain for the milestone — lets a verifier confirm the evidence has not been altered.
 */
export async function checkIntegrity(id: string) {
  const evidence = await getEvidence(id);
  const onChain = await readOnChainCampaign(evidence.campaignId);
  const m = onChain.milestones[evidence.milestoneId] as unknown as { evidenceCID: string; evidenceHash: string };

  const manifestBytes = await fetchStored(evidence.manifest.ref);
  const manifestHash = manifestBytes ? `0x${sha256Hex(manifestBytes)}` : null;
  const files = await Promise.all(
    evidence.files.map(async (f) => {
      const bytes = await fetchStored(f.ref);
      const computed = bytes ? sha256Hex(bytes) : null;
      return { name: f.name, ref: f.ref, expected: f.sha256, computed, match: computed === f.sha256 };
    }),
  );
  const onChainMatchesThis = m.evidenceCID === evidence.manifest.ref && m.evidenceHash.toLowerCase() === evidence.manifest.sha256;
  return {
    evidenceId: evidence.id,
    onChain: { evidenceCID: m.evidenceCID || null, evidenceHash: m.evidenceHash },
    isCurrentOnChainEvidence: onChainMatchesThis,
    manifest: { ref: evidence.manifest.ref, expected: evidence.manifest.sha256, computed: manifestHash, match: manifestHash === evidence.manifest.sha256 },
    files,
    allMatch: onChainMatchesThis && manifestHash === evidence.manifest.sha256 && files.every((f) => f.match),
  };
}
