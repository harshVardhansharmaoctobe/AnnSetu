import { expect, type Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:4000/api";

/** Register through the UI; if the wallet already has an account (re-run), sign in instead. */
export async function ensureAccount(page: Page, name: string, role: "Donor" | "NGO" | "Verifier", organization?: string) {
  await page.bringToFront();
  await page.goto("/register");
  await page.getByText(role, { exact: true }).click();
  await page.getByLabel("Your name").fill(name);
  if (organization) await page.getByLabel("Organisation").fill(organization);
  await page.getByRole("button", { name: /create account/ }).click();
  const outcome = await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 30_000 }).then(() => "registered" as const),
    page.getByText(/already has an account/).waitFor({ timeout: 30_000 }).then(() => "exists" as const),
  ]);
  if (outcome === "exists") {
    await page.goto("/login");
    await page.getByRole("button", { name: /Sign message & continue/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
}

export async function expectTxConfirmed(page: Page, text: RegExp | string) {
  await expect(page.getByText(text)).toBeVisible({ timeout: 60_000 });
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}
