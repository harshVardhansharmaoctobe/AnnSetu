import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { TxState } from "@/hooks/useContractTx";
import type { Campaign } from "@/lib/types";
import { StorageBadge } from "./chain";
import { FundsSummary } from "./FundsSummary";
import { TxStatusPanel } from "./TxStatusPanel";

const HASH = `0x${"ab".repeat(32)}`;
const base: TxState = { phase: "idle", label: "Donation", hash: null, blockNumber: null, error: null, indexed: false };
const renderPanel = (s: Partial<TxState>) =>
  render(
    <MemoryRouter>
      <TxStatusPanel state={{ ...base, ...s }} successMessage="Donation confirmed!" />
    </MemoryRouter>,
  );

describe("TxStatusPanel", () => {
  it("never shows success while waiting for the signature or the receipt", () => {
    renderPanel({ phase: "signing" });
    expect(screen.getByText(/confirm in your wallet/)).toBeInTheDocument();
    expect(screen.queryByText("Donation confirmed!")).toBeNull();
  });

  it("shows the hash while pending, still without success", () => {
    renderPanel({ phase: "pending", hash: HASH });
    expect(screen.getByText(/waiting for the block/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /0xabab/ })).toHaveAttribute("href", `/tx/${HASH}`);
    expect(screen.queryByText("Donation confirmed!")).toBeNull();
  });

  it("shows success with block and hash only once confirmed", () => {
    renderPanel({ phase: "confirmed", hash: HASH, blockNumber: 42, indexed: true });
    expect(screen.getByText("Donation confirmed!")).toBeInTheDocument();
    expect(screen.getByText(/Block 42/)).toBeInTheDocument();
  });

  it("shows the failure reason", () => {
    renderPanel({ phase: "failed", error: "You rejected the request in your wallet. Nothing was sent." });
    expect(screen.getByRole("alert")).toHaveTextContent(/Donation failed.*rejected the request/);
  });
});

describe("FundsSummary", () => {
  const campaign = {
    targetWei: "300000000000000000",
    totalDonatedWei: "200000000000000000",
    totalReleasedWei: "100000000000000000",
    escrowWei: "100000000000000000",
  } as Campaign;

  it("distinguishes donated, escrowed and released funds", () => {
    render(<FundsSummary campaign={campaign} showChart={false} />);
    expect(screen.getByText("Total donated")).toBeInTheDocument();
    expect(screen.getByText("Held in escrow")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
    expect(screen.getByText(/Locked until milestones are verified/)).toBeInTheDocument();
    expect(screen.getByText("66.7% funded")).toBeInTheDocument();
  });
});

describe("StorageBadge", () => {
  it("never labels local storage as IPFS", () => {
    const { rerender } = render(<StorageBadge isIpfs={false} />);
    expect(screen.getByText(/not IPFS/)).toBeInTheDocument();
    rerender(<StorageBadge isIpfs />);
    expect(screen.getByText("IPFS")).toBeInTheDocument();
  });
});
