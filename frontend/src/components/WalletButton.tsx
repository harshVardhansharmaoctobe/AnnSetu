import { Wallet } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { shortAddress } from "@/lib/format";
import { config } from "@/lib/config";
import { Button } from "./ui/button";

export function WalletButton({ className }: { className?: string }) {
  const wallet = useWallet();
  if (!wallet.hasProvider) {
    return (
      <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className={className}>
        <Button variant="outline" size="sm">
          <Wallet className="size-4" /> Install MetaMask
        </Button>
      </a>
    );
  }
  if (!wallet.account) {
    return (
      <Button variant="outline" size="sm" onClick={() => void wallet.connect()} loading={wallet.connecting} className={className}>
        <Wallet className="size-4" /> Connect wallet
      </Button>
    );
  }
  return (
    <span
      className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm ${wallet.isCorrectNetwork ? "border-slate-200 bg-white" : "border-amber-300 bg-amber-50"} ${className ?? ""}`}
      title={`${wallet.account} on chain ${wallet.chainId}`}
    >
      <span className={`size-2 rounded-full ${wallet.isCorrectNetwork ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
      <span className="font-mono text-xs text-navy-700">{shortAddress(wallet.account)}</span>
      <span className="hidden text-xs text-navy-400 sm:inline">{wallet.isCorrectNetwork ? config.chainName : "Wrong network"}</span>
    </span>
  );
}
