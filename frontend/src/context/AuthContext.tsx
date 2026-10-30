import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api, tokenStore, type AuthResponse } from "@/lib/api";
import type { Role, RoleSet, User } from "@/lib/types";
import { sameAddress } from "@/lib/format";
import { describeTxError } from "@/lib/txErrors";
import { useWallet } from "./WalletContext";

interface RegisterInput {
  name: string;
  email?: string;
  organization?: string;
  requestedRole: "DONOR" | "NGO" | "VERIFIER";
}

interface AuthState {
  user: User | null;
  roles: RoleSet | null;
  chainAvailable: boolean;
  loading: boolean;
  /** Connected wallet differs from the signed-in account. */
  walletMismatch: boolean;
  signIn: () => Promise<void>;
  register: (input: RegisterInput) => Promise<RoleSet | null>;
  signOut: () => void;
  refresh: () => Promise<void>;
  hasRole: (role: Role) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<RoleSet | null>(null);
  const [chainAvailable, setChainAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((res: Omit<AuthResponse, "token"> & { token?: string }) => {
    if (res.token) tokenStore.set(res.token);
    setUser(res.user);
    setRoles(res.roles);
    setChainAvailable(res.chainAvailable);
  }, []);

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setRoles(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    try {
      apply(await api.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signOut();
    } finally {
      setLoading(false);
    }
  }, [apply, signOut]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Ask the wallet to sign the server's one-time sign-in message. */
  const signNonce = useCallback(async () => {
    const account = wallet.account ?? (await wallet.connect());
    if (!account) throw new Error(wallet.error ?? "Connect your wallet first");
    const { message } = await api.nonce(account);
    const signer = await wallet.getSigner();
    try {
      return { address: account, signature: await signer.signMessage(message) };
    } catch (err) {
      throw new Error(describeTxError(err));
    }
  }, [wallet]);

  const signIn = useCallback(async () => {
    const { address, signature } = await signNonce();
    apply(await api.login(address, signature));
  }, [signNonce, apply]);

  const register = useCallback(
    async (input: RegisterInput) => {
      const { address, signature } = await signNonce();
      const res = await api.register({ address, signature, ...input });
      apply(res);
      return res.roles;
    },
    [signNonce, apply],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      roles,
      chainAvailable,
      loading,
      walletMismatch: !!user && !!wallet.account && !sameAddress(user.address, wallet.account),
      signIn,
      register,
      signOut,
      refresh,
      hasRole: (role) => (role === "DONOR" ? !!user : !!roles?.roles.includes(role)),
    }),
    [user, roles, chainAvailable, loading, wallet.account, signIn, register, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
