import { BrowserProvider, type Eip1193Provider, type JsonRpcSigner } from "ethers";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { config } from "@/lib/config";
import { describeTxError } from "@/lib/txErrors";

interface InjectedProvider extends Eip1193Provider {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

interface WalletState {
  hasProvider: boolean;
  account: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  switchNetwork: () => Promise<void>;
  getSigner: () => Promise<JsonRpcSigner>;
}

const WalletContext = createContext<WalletState | null>(null);

const toHex = (n: number) => `0x${n.toString(16)}`;

function addChainParams() {
  if (config.chainId === 11155111) {
    return {
      chainId: toHex(config.chainId),
      chainName: "Sepolia",
      nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: [config.rpcUrl || "https://ethereum-sepolia-rpc.publicnode.com"],
      blockExplorerUrls: config.explorerUrl ? [config.explorerUrl] : ["https://sepolia.etherscan.io"],
    };
  }
  return {
    chainId: toHex(config.chainId),
    chainName: config.chainName,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: [config.rpcUrl],
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore an existing connection without prompting, then follow wallet changes.
  useEffect(() => {
    if (!eth) return;
    let cancelled = false;
    eth
      .request({ method: "eth_accounts" })
      .then((accs) => !cancelled && setAccount(((accs as string[])[0] ?? null)?.toLowerCase() ?? null))
      .catch(() => undefined);
    eth
      .request({ method: "eth_chainId" })
      .then((id) => !cancelled && setChainId(Number(id)))
      .catch(() => undefined);

    const onAccounts = (accs: unknown) => setAccount(((accs as string[])[0] ?? null)?.toLowerCase() ?? null);
    const onChain = (id: unknown) => setChainId(Number(id));
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      cancelled = true;
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [eth]);

  const connect = useCallback(async () => {
    if (!eth) {
      setError("MetaMask was not detected. Install the MetaMask browser extension to continue.");
      return null;
    }
    setConnecting(true);
    setError(null);
    try {
      const accs = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const id = Number(await eth.request({ method: "eth_chainId" }));
      const acc = accs[0]?.toLowerCase() ?? null;
      setAccount(acc);
      setChainId(id);
      return acc;
    } catch (err) {
      setError(describeTxError(err));
      return null;
    } finally {
      setConnecting(false);
    }
  }, [eth]);

  const switchNetwork = useCallback(async () => {
    if (!eth) return;
    setError(null);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(config.chainId) }] });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 4902 || code === -32603) {
        try {
          await eth.request({ method: "wallet_addEthereumChain", params: [addChainParams()] });
          return;
        } catch (addErr) {
          setError(describeTxError(addErr));
          return;
        }
      }
      setError(describeTxError(err));
    }
  }, [eth]);

  const getSigner = useCallback(async () => {
    if (!eth) throw new Error("MetaMask was not detected");
    // A fresh provider per call avoids ethers' "network changed" errors after a chain switch.
    return new BrowserProvider(eth).getSigner();
  }, [eth]);

  const value = useMemo<WalletState>(
    () => ({
      hasProvider: !!eth,
      account,
      chainId,
      isCorrectNetwork: chainId === config.chainId,
      connecting,
      error,
      connect,
      switchNetwork,
      getSigner,
    }),
    [eth, account, chainId, connecting, error, connect, switchNetwork, getSigner],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
