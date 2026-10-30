import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { Alert } from "./ui/feedback";
import { Button } from "./ui/button";

/** App-wide warnings: backend down, chain not ready, wrong network, wallet ≠ session, local-dev storage. */
export function StatusBanners() {
  const wallet = useWallet();
  const auth = useAuth();
  const status = useApi(() => api.chainStatus(), []);

  const banners = [];
  if (status.error) {
    banners.push(
      <Alert key="api" tone="error" title="TrustChain API unavailable" action={<Button size="sm" variant="outline" onClick={status.reload}>Retry</Button>}>
        {status.error.message} Live data and dashboards cannot load until it is back.
      </Alert>,
    );
  } else if (status.data && !status.data.chain.ok) {
    banners.push(
      <Alert key="chain" tone="warning" title="Blockchain not reachable from the API">
        {status.data.chain.reason}. Balances may be out of date.
      </Alert>,
    );
  }
  if (!config.contractAddress) {
    banners.push(
      <Alert key="contract" tone="error" title="Contract not configured">
        No TrustChain contract address for chain {config.chainId}. Deploy the contract or set VITE_CONTRACT_ADDRESS.
      </Alert>,
    );
  }
  if (wallet.account && !wallet.isCorrectNetwork) {
    banners.push(
      <Alert
        key="network"
        tone="warning"
        title="Wrong network"
        action={
          <Button size="sm" variant="outline" onClick={() => void wallet.switchNetwork()}>
            Switch to {config.chainName}
          </Button>
        }
      >
        Your wallet is on chain {wallet.chainId}. TrustChain runs on {config.chainName} (chain {config.chainId}). Transactions are disabled until you switch.
      </Alert>,
    );
  }
  if (auth.walletMismatch) {
    banners.push(
      <Alert key="mismatch" tone="warning" title="Different wallet connected" action={<Button size="sm" variant="outline" onClick={auth.signOut}>Sign out</Button>}>
        You are signed in as {shortAddress(auth.user?.address)} but MetaMask is using {shortAddress(wallet.account)}. Switch accounts in MetaMask, or sign out and sign in again.
      </Alert>,
    );
  }
  if (wallet.error) {
    banners.push(
      <Alert key="wallet" tone="error" title="Wallet">
        {wallet.error}
      </Alert>,
    );
  }
  if (status.data?.storage && !status.data.storage.configured) {
    banners.push(
      <Alert key="storage" tone="warning" title="Evidence storage not configured">
        {status.data.storage.warning}
      </Alert>,
    );
  }

  if (banners.length === 0) return null;
  return <div className="mx-auto w-full max-w-7xl space-y-2 px-4 pt-4 sm:px-6">{banners}</div>;
}
