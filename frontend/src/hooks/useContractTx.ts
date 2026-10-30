import { Contract, type ContractTransactionResponse, type TransactionReceipt } from "ethers";
import { useCallback, useState } from "react";
import abi from "@/contracts/TrustChain.abi.json";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { describeTxError } from "@/lib/txErrors";

export type TxPhase = "idle" | "signing" | "pending" | "indexing" | "confirmed" | "failed";

export interface TxState {
  phase: TxPhase;
  label: string;
  hash: string | null;
  blockNumber: number | null;
  error: string | null;
  /** True once the backend verified the receipt and indexed its events. */
  indexed: boolean;
}

const IDLE: TxState = { phase: "idle", label: "", hash: null, blockNumber: null, error: null, indexed: false };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wallet-signed contract transaction with a visible lifecycle:
 * signing (MetaMask prompt) → pending (hash known) → indexing (receipt status 1) → confirmed | failed.
 * Success is only reported after the receipt confirms the transaction did not revert.
 */
export function useContractTx() {
  const wallet = useWallet();
  const [state, setState] = useState<TxState>(IDLE);

  const run = useCallback(
    async (label: string, send: (contract: Contract) => Promise<ContractTransactionResponse>): Promise<TransactionReceipt | null> => {
      setState({ ...IDLE, phase: "signing", label });
      try {
        if (!config.contractAddress) throw new Error("TrustChain contract address is not configured for this network.");
        if (!wallet.account && !(await wallet.connect())) throw new Error(wallet.error ?? "Connect your wallet first.");

        const signer = await wallet.getSigner();
        // Read the chain from the wallet itself (React state may lag right after connecting).
        const { chainId } = await signer.provider.getNetwork();
        if (Number(chainId) !== config.chainId) {
          throw new Error(`Your wallet is on the wrong network. Switch to ${config.chainName} (chain ${config.chainId}) first.`);
        }
        const contract = new Contract(config.contractAddress, abi, signer);
        const tx = await send(contract);
        setState((s) => ({ ...s, phase: "pending", hash: tx.hash }));

        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw Object.assign(new Error("Transaction reverted on-chain."), { hash: tx.hash });
        setState((s) => ({ ...s, phase: "indexing", blockNumber: receipt.blockNumber }));

        // Ask the backend to verify the receipt and index its events; the poller would catch up anyway.
        let indexed = false;
        for (let attempt = 0; attempt < 4 && !indexed; attempt++) {
          try {
            await api.syncTx(receipt.hash);
            indexed = true;
          } catch {
            await sleep(1500);
          }
        }
        setState((s) => ({ ...s, phase: "confirmed", indexed }));
        return receipt;
      } catch (err) {
        const hash = (err as { hash?: string; receipt?: { hash?: string } }).receipt?.hash ?? (err as { hash?: string }).hash;
        setState((s) => ({ ...s, phase: "failed", error: describeTxError(err), hash: s.hash ?? hash ?? null }));
        return null;
      }
    },
    [wallet],
  );

  const reset = useCallback(() => setState(IDLE), []);
  const busy = state.phase === "signing" || state.phase === "pending" || state.phase === "indexing";
  return { state, run, reset, busy };
}
