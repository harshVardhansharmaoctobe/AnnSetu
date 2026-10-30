import { KeyRound, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { dashboardPath } from "@/components/layout/Layouts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { ApiError } from "@/lib/api";
import { config } from "@/lib/config";

export default function Login() {
  const wallet = useWallet();
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const next = params.get("next");

  useEffect(() => {
    if (auth.user && !auth.walletMismatch) navigate(next ?? dashboardPath(auth.roles?.roles), { replace: true });
  }, [auth.user, auth.roles, auth.walletMismatch, navigate, next]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    setNeedsRegistration(false);
    try {
      await auth.signIn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNeedsRegistration(true);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <Card className="p-6 sm:p-8">
        <div className="flex size-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
          <KeyRound className="size-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in with your wallet</h1>
        <p className="mt-1 text-sm text-navy-500">
          You will sign a one-time message in MetaMask to prove you own the wallet. Signing is free and sends no transaction.
        </p>

        <div className="mt-6 space-y-3">
          {!wallet.hasProvider ? (
            <Alert tone="warning" title="MetaMask not detected">
              Install the <a className="underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask extension</a> and reload this page.
            </Alert>
          ) : (
            <>
              {wallet.account && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  Wallet: <span className="font-mono text-xs">{wallet.account}</span>
                  {!wallet.isCorrectNetwork && <span className="ml-1 text-amber-700">(not on {config.chainName})</span>}
                </p>
              )}
              <Button className="w-full" size="lg" onClick={() => void signIn()} loading={busy || wallet.connecting}>
                <Wallet className="size-4" /> {wallet.account ? "Sign message & continue" : "Connect MetaMask"}
              </Button>
            </>
          )}
          {needsRegistration && (
            <Alert tone="info" title="No account for this wallet yet">
              <Link to="/register" className="font-medium underline">Create an account</Link> first — it takes a few seconds.
            </Alert>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          {auth.walletMismatch && (
            <Alert tone="warning">
              You are signed in with a different wallet. <button className="underline" onClick={auth.signOut}>Sign out</button> to switch.
            </Alert>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-navy-500">
          New to TrustChain? <Link to="/register" className="font-medium text-accent-700 hover:underline">Register</Link>
        </p>
      </Card>
    </div>
  );
}
