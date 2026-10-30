import { chainConfig, getProvider } from "../config/chain.js";
import { HttpError, badRequest, unavailable } from "../utils/errors.js";
import { TX_HASH_RE } from "../utils/chain.js";
import { processLogs, type IndexedEvent } from "./indexerService.js";

/**
 * Verify a client-reported transaction against the chain and index its TrustChain events.
 *
 * Nothing in the request is trusted except the hash itself: the receipt, its status, its target
 * and every event are fetched from the RPC node, and only logs emitted by the configured
 * TrustChain contract are accepted.
 */
export async function verifyAndIndexTx(txHash: string): Promise<{ events: IndexedEvent[]; blockNumber: number; from: string }> {
  if (!TX_HASH_RE.test(txHash)) throw badRequest("txHash must be a 0x-prefixed 32-byte hex string");
  if (!chainConfig.contractAddress) throw unavailable("TrustChain contract address is not configured");

  const provider = getProvider();
  let receipt;
  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch {
    throw unavailable("Blockchain RPC is unavailable");
  }
  if (!receipt) throw new HttpError(404, "Transaction not found or not yet mined", "TX_NOT_FOUND");
  if (receipt.status !== 1) throw new HttpError(422, "Transaction reverted on-chain", "TX_REVERTED");

  const contract = chainConfig.contractAddress.toLowerCase();
  if (receipt.to?.toLowerCase() !== contract) {
    throw new HttpError(422, "Transaction was not sent to the TrustChain contract", "TX_WRONG_CONTRACT");
  }
  const logs = receipt.logs.filter((l) => l.address.toLowerCase() === contract);
  const events = await processLogs(logs);
  if (events.length === 0) throw new HttpError(422, "Transaction emitted no TrustChain events", "TX_NO_EVENTS");
  return { events, blockNumber: receipt.blockNumber, from: receipt.from.toLowerCase() };
}
