import { Lock, ShieldAlert } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/lib/types";
import { buttonClass } from "./ui/button";
import { Card } from "./ui/card";
import { EmptyState, ErrorState, LoadingState } from "./ui/feedback";

const ROLE_NAMES: Record<Role, string> = { ADMIN: "platform admin", NGO: "NGO", VERIFIER: "verifier", DONOR: "donor" };

/**
 * Route guard. Privileged roles come from the contract (via /auth/me); the requested role a user
 * picked at registration never grants access by itself.
 */
export function RequireRole({ role }: { role: Role }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.loading) return <LoadingState label="Checking your session…" />;
  if (!auth.user) {
    return (
      <Card>
        <EmptyState
          icon={Lock}
          title="Sign in required"
          description="Sign in with your wallet to open this dashboard."
          action={
            <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className={buttonClass("primary")}>
              Sign in with wallet
            </Link>
          }
        />
      </Card>
    );
  }
  if (role !== "DONOR" && !auth.chainAvailable) {
    return (
      <Card>
        <ErrorState error="The blockchain is unreachable, so your on-chain role cannot be verified right now." onRetry={() => void auth.refresh()} />
      </Card>
    );
  }
  if (!auth.hasRole(role)) {
    const applied = auth.user.requestedRole === role;
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title={`This area is for ${ROLE_NAMES[role]}s`}
          description={
            applied
              ? `You applied for ${ROLE_NAMES[role]} access. A platform admin must authorise your wallet on-chain before this dashboard unlocks. Once approved, refresh this page.`
              : `Your wallet (${auth.user.address}) is not authorised as ${ROLE_NAMES[role]} in the TrustChain contract.`
          }
          action={
            <button type="button" className={buttonClass("outline")} onClick={() => void auth.refresh()}>
              Re-check my on-chain role
            </button>
          }
        />
      </Card>
    );
  }
  return <Outlet />;
}
