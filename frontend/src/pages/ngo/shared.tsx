import { ArrowLeft, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useParams } from "react-router";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { cn, sameAddress } from "@/lib/format";
import type { Campaign } from "@/lib/types";

/** Load a campaign and make sure the signed-in NGO wallet is its creator (the contract enforces this too). */
export function OwnedCampaign({ children }: { children: (c: Campaign, reload: () => void) => ReactNode }) {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.campaign(id), [id]);

  if (loading) return <LoadingState label="Loading campaign from the contract…" />;
  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;
  const c = data!.campaign;
  if (!sameAddress(c.ngo?.address, user?.address)) {
    return (
      <Card>
        <EmptyState icon={ShieldAlert} title="Not your campaign" description="Only the NGO wallet that created this campaign can manage it." action={<Link to="/ngo" className="text-sm font-medium text-accent-700">Back to dashboard</Link>} />
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <Link to="/ngo" className="inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
          <ArrowLeft className="size-4" /> NGO dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{c.title}</h1>
        <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Campaign sections">
          {[
            { to: `/ngo/campaigns/${c.id}`, label: "Overview", end: true },
            { to: `/ngo/campaigns/${c.id}/milestones`, label: "Milestones" },
            { to: `/ngo/campaigns/${c.id}/donations`, label: "Donations" },
          ].map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap", isActive ? "border-navy-900 text-navy-900" : "border-transparent text-navy-500 hover:text-navy-800")
              }
            >
              {t.label}
            </NavLink>
          ))}
          <Link to={`/campaigns/${c.id}/transparency`} className="ml-auto px-3 py-2 text-sm whitespace-nowrap text-accent-700 hover:underline">
            Public view →
          </Link>
        </nav>
      </div>
      {children(c, () => void reload())}
    </div>
  );
}
