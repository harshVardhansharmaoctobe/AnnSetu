import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Test wallet: an injected EIP-1193 provider standing in for the MetaMask extension (which cannot
 * be automated). Account/chain queries are answered locally; everything else — including
 * personal_sign and eth_sendTransaction — is forwarded to the local Hardhat node, which signs with
 * its unlocked development accounts. The app code path (ethers BrowserProvider → signer → contract)
 * is exactly the one used with MetaMask.
 */
export const RPC_URL = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8545";

export interface WalletOptions {
  chainId?: number;
  /** Simulate the user pressing "Reject" in the wallet for transactions. */
  rejectTransactions?: boolean;
}

let rpcId = 1;
export async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const body = await res.json();
  if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code, data: body.error.data });
  return body.result as T;
}

export async function hardhatAccount(index: number): Promise<string> {
  const accounts = await rpc<string[]>("eth_accounts");
  return accounts[index].toLowerCase();
}

export async function walletContext(browser: Browser, account: string, opts: WalletOptions = {}): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.exposeBinding("__walletRpc", async (_src, method: string, params: unknown[]) => {
    try {
      return { result: await rpc(method, params) };
    } catch (e) {
      const err = e as { message: string; code?: number; data?: unknown };
      return { error: { message: err.message, code: err.code ?? -32603, data: err.data } };
    }
  });
  await context.addInitScript(
    ({ account, chainId, reject }) => {
      const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
      const w = window as unknown as { __walletRpc: (m: string, p: unknown[]) => Promise<{ result?: unknown; error?: { message: string; code: number; data?: unknown } }> };
      (window as unknown as { ethereum: unknown }).ethereum = {
        isMetaMask: true,
        on: (ev: string, fn: (...a: unknown[]) => void) => ((listeners[ev] ??= []).push(fn)),
        removeListener: (ev: string, fn: (...a: unknown[]) => void) => (listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn)),
        async request({ method, params = [] }: { method: string; params?: unknown[] }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
          if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
          if (method === "net_version") return String(chainId);
          if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
          if (reject && method === "eth_sendTransaction") throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          const res = await w.__walletRpc(method, params as unknown[]);
          if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code, data: res.error.data });
          return res.result;
        },
      };
    },
    { account, chainId: opts.chainId ?? 31337, reject: !!opts.rejectTransactions },
  );
  return context;
}

/** Wallet-signature login through the real /login page. */
export async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Sign message & continue|Connect MetaMask/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function register(page: Page, name: string, role: "Donor" | "NGO" | "Verifier", organization?: string) {
  await page.goto("/register");
  await page.getByText(role, { exact: true }).click();
  await page.getByLabel("Your name").fill(name);
  if (organization) await page.getByLabel("Organisation").fill(organization);
  await page.getByRole("button", { name: /create account/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/register"));
}

export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("e2e-cover")]);
export const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("e2e-site-photo")]);
export const PDF = Buffer.from("%PDF-1.4\n% e2e cement receipt\n%%EOF\n");
