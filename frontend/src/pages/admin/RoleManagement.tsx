import { ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { isAddress } from "ethers";
import { AddressLink, DemoBadge, TxLink } from "@/components/chain";
import { PageHeader } from "@/components/layout/Layouts";
import { TxStatusPanel } from "@/components/TxStatusPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import { useContractTx } from "@/hooks/useContractTx";
import { api } from "@/lib/api";
import { formatDate, shortAddress } from "@/lib/format";

type Kind = "NGO" | "VERIFIER";
const LABEL: Record<Kind, string> = { NGO: "NGO", VERIFIER: "verifier" };

/** Admin authorises / revokes NGO or verifier wallets with signed on-chain transactions. */
export function RoleManagement({ kind }: { kind: Kind }) {
  const label = LABEL[kind];
  const tx = useContractTx();
  const data = useApi(() => Promise.all([api.applications(), kind === "NGO" ? api.ngos() : api.verifiers()]), [kind]);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const grant = async (address: string) => {
    const ok = await tx.run(`Authorise ${label}`, (c) => (kind === "NGO" ? c.registerNGO(address) : c.registerVerifier(address)));
    if (ok) void data.reload();
    return ok;
  };
  const revoke = async (address: string) => {
    setRevoking(null);
    if (await tx.run(`Revoke ${label}`, (c) => (kind === "NGO" ? c.revokeNGO(address) : c.revokeVerifier(address)))) void data.reload();
  };
  const submitManual = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAddress(manual.trim())) return setManualError("Enter a valid wallet address");
    setManualError(null);
    if (await grant(manual.trim())) setManual("");
  };

  if (data.loading) return <LoadingState />;
  if (data.error) return <Card><ErrorState error={data.error} onRetry={data.reload} /></Card>;
  const [apps, authorized] = data.data!;
  const pending = apps.applications.filter((a) => a.requestedRole === kind && a.onChain && !(kind === "NGO" ? a.onChain.isNGO : a.onChain.isVerifier));

  return (
    <div className="space-y-6">
      <PageHeader title={`${kind === "NGO" ? "NGO" : "Verifier"} management`} description={`Authorising a ${label} grants the on-chain ${kind}_ROLE. An address can never be both an NGO and a verifier.`} />
      <TxStatusPanel state={tx.state} />

      <Card>
        <CardHeader title="Pending applications" description={`Users who registered and asked for ${label} access.`} />
        {pending.length === 0 ? (
          <EmptyState icon={Users} title="No pending applications" />
        ) : (
          <Table>
            <THead><tr><TH>Applicant</TH><TH>Organisation</TH><TH>Email</TH><TH>Applied</TH><TH /></tr></THead>
            <TBody>
              {pending.map((a) => (
                <TR key={a.address}>
                  <TD><p className="font-medium">{a.name} <DemoBadge show={a.isDemo} /></p><AddressLink address={a.address} /></TD>
                  <TD>{a.organization ?? "—"}</TD>
                  <TD className="text-xs">{a.email ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{formatDate(a.createdAt)}</TD>
                  <TD className="text-right">
                    {(kind === "NGO" ? a.onChain?.isVerifier : a.onChain?.isNGO) ? (
                      <Badge tone="rose">Holds the {kind === "NGO" ? "verifier" : "NGO"} role</Badge>
                    ) : (
                      <Button size="sm" variant="success" loading={tx.busy} onClick={() => void grant(a.address)}><UserPlus className="size-4" /> Authorise</Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title={`Authorise a ${label} by address`} description="For wallets that have not registered a profile yet." />
        <CardContent>
          <form onSubmit={submitManual} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Field label="Wallet address" htmlFor="manual-address" error={manualError} className="flex-1">
              <Input id="manual-address" placeholder="0x…" className="font-mono" value={manual} onChange={(e) => setManual(e.target.value)} aria-invalid={!!manualError} />
            </Field>
            <Button type="submit" className="sm:mt-6" loading={tx.busy}><ShieldCheck className="size-4" /> Authorise on-chain</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title={`Authorised ${label}s`} description="Derived from the contract's registration and revocation events." />
        {authorized.accounts.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={`No ${label}s authorised yet`} />
        ) : (
          <Table>
            <THead><tr><TH>Account</TH><TH>Organisation</TH><TH>Authorised</TH><TH>Transaction</TH><TH /></tr></THead>
            <TBody>
              {authorized.accounts.map((a) => (
                <TR key={a.address}>
                  <TD><p className="font-medium">{a.name ?? "No profile"} <DemoBadge show={a.isDemo} /></p><AddressLink address={a.address} /></TD>
                  <TD>{a.organization ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{formatDate(a.authorizedAt, true)}</TD>
                  <TD><TxLink hash={a.txHash} /></TD>
                  <TD className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setRevoking(a.address)} disabled={tx.busy}><UserMinus className="size-4" /> Revoke</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent title={`Revoke ${label} ${shortAddress(revoking)}?`} description={kind === "NGO" ? "The NGO will no longer be able to create campaigns or submit evidence. Funds in escrow stay locked in the contract." : "The verifier will no longer be able to approve or reject milestones. Reassign their campaigns to another verifier."}>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => revoking && void revoke(revoking)}>Revoke in MetaMask</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const NgoManagement = () => <RoleManagement kind="NGO" />;
export const VerifierManagement = () => <RoleManagement kind="VERIFIER" />;
