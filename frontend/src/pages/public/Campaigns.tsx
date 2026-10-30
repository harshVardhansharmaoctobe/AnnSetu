import { Search, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CampaignCard } from "@/components/CampaignCard";
import { PageHeader } from "@/components/layout/Layouts";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";

export default function Campaigns() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const state = params.get("state") ?? "all";
  const [search, setSearch] = useState(q);

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) setParams((p) => {
        if (search) p.set("q", search);
        else p.delete("q");
        return p;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const { data, error, loading, reload } = useApi(() => api.campaigns({ q: q || undefined, state }), [q, state]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader title="Campaigns" description="Every campaign below exists on-chain. Donations are held in escrow until milestones are verified." />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-navy-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title" className="pl-9" aria-label="Search campaigns" maxLength={100} />
        </div>
        <Select
          value={state}
          onChange={(e) =>
            setParams((p) => {
              p.set("state", e.target.value);
              return p;
            })
          }
          className="sm:w-56"
          aria-label="Filter by status"
        >
          <option value="all">All campaigns</option>
          <option value="active">Accepting donations</option>
          <option value="ended">Closed to donations</option>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : data!.campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={q || state !== "all" ? "No campaigns match your filters" : "No campaigns yet"}
            description={q || state !== "all" ? "Try a different search or filter." : "Campaigns appear here once an authorised NGO creates one on-chain."}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data!.campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}
