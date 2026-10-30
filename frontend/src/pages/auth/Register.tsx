import { UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { dashboardPath } from "@/components/layout/Layouts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/context/WalletContext";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/format";

type RequestedRole = "DONOR" | "NGO" | "VERIFIER";

const ROLES: { value: RequestedRole; title: string; text: string }[] = [
  { value: "DONOR", title: "Donor", text: "Donate test ETH and track how it is used." },
  { value: "NGO", title: "NGO", text: "Run campaigns. Requires admin approval on-chain." },
  { value: "VERIFIER", title: "Verifier", text: "Review milestone evidence. Requires admin approval on-chain." },
];

export default function Register() {
  const wallet = useWallet();
  const auth = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", organization: "", requestedRole: "DONOR" as RequestedRole });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = "Enter at least 2 characters";
    if (form.name.trim().length > 80) e.name = "At most 80 characters";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
    if (form.requestedRole !== "DONOR" && form.organization.trim().length < 2) e.organization = "Organisation name is required for NGOs and verifiers";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setError(null);
    try {
      const roles = await auth.register({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        organization: form.organization.trim() || undefined,
        requestedRole: form.requestedRole,
      });
      navigate(dashboardPath(roles?.roles), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "This wallet already has an account. Please sign in instead." : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (auth.user) {
    return (
      <div className="mx-auto max-w-md px-4 py-14">
        <Alert tone="info" title={`Signed in as ${auth.user.name}`}>
          <Link to={dashboardPath(auth.roles?.roles)} className="underline">Go to your dashboard</Link>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <Card className="p-6 sm:p-8">
        <div className="flex size-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
          <UserPlus className="size-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Create your TrustChain account</h1>
        <p className="mt-1 text-sm text-navy-500">Your wallet is your identity. You'll sign a message to prove ownership — no password.</p>

        <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-navy-800">I am joining as</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {ROLES.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    "cursor-pointer rounded-lg border p-3 text-sm transition",
                    form.requestedRole === r.value ? "border-navy-900 bg-navy-50 ring-1 ring-navy-900" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    className="sr-only"
                    checked={form.requestedRole === r.value}
                    onChange={() => setForm({ ...form, requestedRole: r.value })}
                  />
                  <span className="font-medium">{r.title}</span>
                  <span className="mt-0.5 block text-xs text-navy-500">{r.text}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Your name" htmlFor="name" error={errors.name} required>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} maxLength={80} autoComplete="name" />
          </Field>
          <Field label="Organisation" htmlFor="org" error={errors.organization} required={form.requestedRole !== "DONOR"} hint="Shown publicly next to your wallet on campaigns.">
            <Input id="org" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} aria-invalid={!!errors.organization} maxLength={120} />
          </Field>
          <Field label="Email (optional)" htmlFor="email" error={errors.email} hint="Only visible to the platform admin.">
            <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!errors.email} autoComplete="email" />
          </Field>

          {form.requestedRole !== "DONOR" && (
            <Alert tone="info">
              Choosing {form.requestedRole === "NGO" ? "NGO" : "verifier"} sends an application. Privileged actions unlock only after the platform admin authorises your wallet on-chain.
            </Alert>
          )}
          {!wallet.hasProvider && (
            <Alert tone="warning" title="MetaMask not detected">
              Install the <a className="underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask extension</a> to register.
            </Alert>
          )}
          {wallet.account && <p className="text-xs text-navy-500">Registering wallet <span className="font-mono">{wallet.account}</span></p>}
          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!wallet.hasProvider}>
            {wallet.account ? "Sign message & create account" : "Connect MetaMask & create account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-navy-500">
          Already registered? <Link to="/login" className="font-medium text-accent-700 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
