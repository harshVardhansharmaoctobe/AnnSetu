import { ArrowLeft, CalendarClock, Eye, FileJson, History, SearchX } from "lucide-react";
import { Link, useParams } from "react-router";
import { CampaignCover, CampaignStateBadge } from "@/components/CampaignCard";
import { AddressLink, DemoBadge, StorageBadge, TxLink } from "@/components/chain";
import { DonatePanel } from "@/components/DonatePanel";
import { EventTimeline } from "@/components/EventTimeline";
import { FundsSummary } from "@/components/FundsSummary";
import { MilestoneList } from "@/components/MilestoneList";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { useApi } from "@/hooks/useApi";
import { ApiError, api } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default function CampaignDetail() {
  const { id = "" } = useParams();
  const campaign = useApi(() => api.campaign(id), [id]);
  const events = useApi(() => api.campaignEvents(id), [id]);

  const reload = () => {
    void campaign.reload();
    void events.reload();
  };

  if (campaign.loading) return <LoadingState label="Loading campaign from the contract…" />;
  if (campaign.error) {
    const notFound = campaign.error instanceof ApiError && (campaign.error.status === 404 || campaign.error.status === 400);
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          {notFound ? (
            <EmptyState icon={SearchX} title="Campaign not found" description={campaign.error.message} action={<Link className={buttonClass("outline")} to="/campaigns">Back to campaigns</Link>} />
          ) : (
            <ErrorState error={campaign.error} onRetry={campaign.reload} />
          )}
        </Card>
      </div>
    );
  }
  const c = campaign.data!.campaign;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link to="/campaigns" className="inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft className="size-4" /> All campaigns
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <CampaignCover campaign={c} className="h-56 sm:h-72" />
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <CampaignStateBadge campaign={c} />
                <DemoBadge show={c.isDemo} />
                <span className="text-xs text-navy-400">Campaign #{c.id}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{c.title}</h1>
              {c.metadataAvailable ? (
                <p className="whitespace-pre-line text-navy-700">{c.description}</p>
              ) : (
                <Alert tone="info">This campaign was created directly on the contract, so no off-chain description is available.</Alert>
              )}
              <dl className="grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-navy-500">NGO (campaign creator)</dt>
                  <dd className="mt-0.5"><AddressLink address={c.ngo?.address} name={c.ngo?.name} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Beneficiary — receives released funds</dt>
                  <dd className="mt-0.5"><AddressLink address={c.beneficiary?.address} name={c.beneficiary?.name} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Independent verifier</dt>
                  <dd className="mt-0.5"><AddressLink address={c.verifier?.address} name={c.verifier?.name} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Donations close</dt>
                  <dd className="mt-0.5 inline-flex items-center gap-1"><CalendarClock className="size-3.5 text-navy-400" /> {formatDate(c.deadline, true)}</dd>
                </div>
                {c.metadata && (
                  <div>
                    <dt className="text-xs text-navy-500">Campaign metadata</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                      {c.metadata.url && (
                        <a className="inline-flex items-center gap-1 text-accent-700 hover:underline" href={c.metadata.url} target="_blank" rel="noreferrer">
                          <FileJson className="size-3.5" /> View JSON
                        </a>
                      )}
                      <StorageBadge isIpfs={c.metadata.isIpfs} />
                    </dd>
                  </div>
                )}
                {c.createdTxHash && (
                  <div>
                    <dt className="text-xs text-navy-500">Creation transaction</dt>
                    <dd className="mt-0.5"><TxLink hash={c.createdTxHash} /></dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Milestones" description="Funds are released per milestone, only after the verifier approves the evidence." />
            <CardContent>
              <MilestoneList milestones={c.milestones} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Funds"
              description={c.source === "chain" ? `Live from the contract · block ${c.syncedBlock}` : "Blockchain unreachable — showing last indexed values"}
            />
            <CardContent>
              <FundsSummary campaign={c} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Donate" />
            <CardContent>
              <DonatePanel campaign={c} onDonated={reload} />
            </CardContent>
          </Card>

          <Link to={`/campaigns/${c.id}/transparency`} className={buttonClass("outline", "md", "w-full")}>
            <Eye className="size-4" /> Open full transparency tracker
          </Link>

          <Card>
            <CardHeader title="Recent on-chain activity" action={<History className="size-4 text-navy-400" />} />
            <CardContent>
              {events.loading ? (
                <LoadingState />
              ) : events.error ? (
                <ErrorState error={events.error} onRetry={events.reload} />
              ) : events.data!.events.length === 0 ? (
                <p className="text-sm text-navy-500">No activity indexed yet.</p>
              ) : (
                <EventTimeline events={events.data!.events.slice(0, 8)} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
