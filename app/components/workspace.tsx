"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  History,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { formatUnits, type Hex } from "viem";
import type { Commitment, UnsignedTransaction } from "@credibleexec/domain";
import type { Compilation } from "@credibleexec/mandate";
export interface WalletAdapter {
  ready: boolean;
  authenticated: boolean;
  address?: string;
  login: () => void;
  logout: () => void;
  getToken: () => Promise<string | null>;
  send: (tx: UnsignedTransaction) => Promise<Hex>;
}
type Health = {
  configured: boolean;
  mode: string;
  missing: string[];
  chainId: number;
  chainName: string;
  bondAmount: string;
};
type Preview = Extract<Compilation, { status: "SUCCESS" }> & { draftId: Hex };
const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;
const amount = (v: string, d = 6) => formatUnits(BigInt(v), d);
const example =
  "Swap 1,000 USDC for ETH and send it to my treasury. Receive at least 0.48 ETH within 5 minutes.";
const terminal = (c: Commitment) =>
  ["FULFILLED", "FAILED", "CANCELLED", "EXPIRED"].includes(c.status);
function StatusBadge({ c }: { c: Commitment }) {
  return (
    <span className={`badge ${c.status.toLowerCase()}`}>
      {c.status === "FULFILLED"
        ? "Fulfilled"
        : c.status === "FAILED"
          ? "Failed"
          : c.status === "FUNDED"
            ? "Bond locked"
            : c.status === "ACTIVE"
              ? "In progress"
              : c.status.toLowerCase()}
    </span>
  );
}

export function Workspace({ wallet }: { wallet?: WalletAdapter }) {
  const [health, setHealth] = useState<Health>();
  const [request, setRequest] = useState("");
  const [recipient, setRecipient] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [current, setCurrent] = useState<Commitment>();
  const [history, setHistory] = useState<Commitment[]>([]);
  const [tab, setTab] = useState<"new" | "history" | "about">("new");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const walletRef = useRef(wallet);
  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);
  const canUse =
    health?.configured && (health.mode === "local" || wallet?.authenticated);
  const authHeaders = useCallback(async () => {
    const w = walletRef.current;
    const token = await w?.getToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(w?.address ? { "x-wallet-address": w.address } : {}),
    };
  }, []);
  const api = useCallback(
    async (path: string, data?: unknown) => {
      const res = await fetch(`/api/${path}`, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      const payload = await res.json();
      if (!res.ok)
        throw new Error(payload.error?.message ?? "Please try again.");
      return payload;
    },
    [authHeaders],
  );
  const refresh = useCallback(async () => {
    try {
      const data = await api("commitments");
      setHistory(data.commitments);
    } catch {}
  }, [api]);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError("The app could not reach its backend."));
  }, []);
  useEffect(() => {
    if (canUse)
      api("commitments")
        .then((data) => setHistory(data.commitments))
        .catch(() => {});
  }, [canUse, api]);
  useEffect(() => {
    if (!current || terminal(current)) return;
    const id = current.id;
    const controller = new AbortController();
    async function watch() {
      while (!controller.signal.aborted)
        try {
          const res = await fetch(`/api/commitments/${id}/events`, {
            headers: await authHeaders(),
            signal: controller.signal,
          });
          if (!res.ok || !res.body) return;
          const reader = res.body.getReader(),
            decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const messages = buffer.split("\n\n");
            buffer = messages.pop() ?? "";
            for (const message of messages)
              if (message.startsWith("data: ")) {
                const record = JSON.parse(message.slice(6)) as Commitment;
                setCurrent(record);
                if (terminal(record)) {
                  void refresh();
                  return;
                }
              }
          }
        } catch {
          return;
        }
    }
    void watch();
    return () => controller.abort();
  }, [current?.id, authHeaders, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  async function task(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  async function compile() {
    await task("Understanding your request", async () => {
      const result = await api("mandates", {
        request,
        ...(recipient ? { recipient } : {}),
      });
      if (result.status === "CLARIFICATION_NEEDED") {
        setQuestions(result.questions);
        return;
      }
      setQuestions([]);
      setPreview(result);
    });
  }
  async function confirm() {
    if (!preview) return;
    await task("Creating your commitment", async () => {
      const c = await api("commitments", {
        draftId: preview.draftId,
        mandateHash: preview.mandateHash,
      });
      setCurrent(c);
      setPreview(undefined);
      setCurrent(await api(`commitments/${c.id}/fund`, {}));
    });
  }
  async function send(tx: UnsignedTransaction): Promise<Hex> {
    if (walletRef.current) return walletRef.current.send(tx);
    if (health?.mode !== "local")
      throw new Error("Connect your Privy wallet first.");
    const r = await fetch("http://127.0.0.1:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendTransaction",
        params: [
          {
            from: tx.from,
            to: tx.to,
            data: tx.data,
            value: `0x${BigInt(tx.value).toString(16)}`,
            ...(tx.nonce !== undefined
              ? { nonce: `0x${tx.nonce.toString(16)}` }
              : {}),
          },
        ],
      }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }
  async function execute() {
    if (!current) return;
    await task("Waiting for wallet authorization", async () => {
      let c = current;
      if (c.status === "FUNDED") {
        const approval = await api(`commitments/${c.id}/approval`, {});
        if (approval.transaction) {
          await send(approval.transaction);
          setError(
            "USDC approval submitted. Once confirmed, click Authorize swap to continue.",
          );
          return;
        }
        c = await api(`commitments/${c.id}/activate`, {});
        setCurrent(c);
      }
      if (!c.transaction) throw new Error("Execution has not been prepared.");
      const cacheKey = `credibleexec:submitted:${c.id}`;
      let hash = localStorage.getItem(cacheKey) as Hex | null;
      if (!hash) {
        hash = await send(c.transaction);
        localStorage.setItem(cacheKey, hash);
      }
      c = await api(`commitments/${c.id}/execute`, { hash });
      setCurrent(c);
      setBusy("Verifying the outcome");
      setCurrent(await api(`commitments/${c.id}/settle`, {}));
    });
  }
  const settled = history.filter(
    (c) => c.status === "FULFILLED" || c.status === "FAILED",
  );
  const locked = history
    .filter((c) => c.bondStatus === "LOCKED")
    .reduce((s, c) => s + BigInt(c.bondAmount), 0n);
  const bond = health?.bondAmount ?? "100000000";
  function reset() {
    setCurrent(undefined);
    setPreview(undefined);
    setError("");
    setQuestions([]);
    setTab("new");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={reset}
          aria-label="CredibleExec home"
        >
          <span className="brand-mark">
            <ShieldCheck size={22} />
          </span>
          credible<span>exec</span>
          <span className="brand-dot">.</span>
        </button>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={tab === "new" ? "nav-link selected" : "nav-link"}
            onClick={() => setTab("new")}
          >
            <LayoutDashboard size={18} />
            Overview
            <span className="nav-dot" />
          </button>
          <button
            className={tab === "history" ? "nav-link selected" : "nav-link"}
            onClick={() => setTab("history")}
          >
            <History size={18} />
            Commitments<span className="nav-count">{history.length}</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="small-icon">
            <ShieldCheck size={20} />
          </span>
          <h3>
            A promise with something
            <br />
            behind it.
          </h3>
          <p>Your agent puts its own collateral on the line.</p>
          <button onClick={() => setTab("about")}>
            How it works <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="network-dot" />
          <span>{health?.chainName ?? "Base"} network</span>
          <span className="version">MVP</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>
              {tab === "history"
                ? "Commitments"
                : tab === "about"
                  ? "How it works"
                  : "Overview"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="network-tag">
              <span className="network-dot" />
              {health?.mode === "local" ? "Local development" : "Base"}
            </span>
            <button
              className="wallet-button"
              onClick={() =>
                wallet?.authenticated ? wallet.logout() : wallet?.login()
              }
              disabled={!wallet || !wallet.ready}
            >
              <Wallet size={16} />
              {wallet?.address
                ? short(wallet.address)
                : health?.mode === "local"
                  ? "Local test wallet"
                  : "Connect wallet"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ACCOUNTABLE BY DESIGN</div>
              <h1>
                {tab === "history"
                  ? "Every promise, on record."
                  : tab === "about"
                    ? "Permission. Promise. Proof."
                    : "Give your agent a goal."}
              </h1>
              <p>
                {tab === "history"
                  ? "Review the commitments you approved and how they settled."
                  : tab === "about"
                    ? "A clear separation between what is allowed and what is delivered."
                    : "Let it make a commitment. Hold it to the outcome."}
              </p>
            </div>
            <span className="header-chip">
              <ShieldCheck size={15} />
              Onchain accountability
            </span>
          </div>
          {health && !health.configured && (
            <div className="setup-banner">
              <div>
                <strong>Your workspace is ready to configure</strong>
                <p>
                  Connect the wallet, agent, and execution services to create
                  your first real commitment.
                </p>
                <details>
                  <summary>Show setup requirements</summary>
                  <p>{health.missing.join(" · ")}</p>
                  <p>Follow docs/SETUP.md in the project folder.</p>
                </details>
              </div>
              <span className="badge">Setup required</span>
            </div>
          )}
          {health?.mode === "local" && (
            <div className="local-banner">
              Local development chain · Test assets only · Local parser and
              execution fixture; Privy, Bazantic, and 1inch are not used in this
              mode.
            </div>
          )}
          {tab === "about" ? (
            <section className="about-grid">
              {[
                [
                  "01",
                  "You define the outcome",
                  "Set a spend limit, minimum ETH received, exact recipient, and deadline. Review the agent’s interpretation before approving.",
                ],
                [
                  "02",
                  "The agent backs its promise",
                  "The operator deposits its own USDC into the bond contract. Your swap funds stay separate in your wallet.",
                ],
                [
                  "03",
                  "Authorize the action",
                  "Privy asks for the exact token approval and swap transaction. 1inch supplies the execution route.",
                ],
                [
                  "04",
                  "The evidence settles it",
                  "A deterministic verifier checks the confirmed transaction. Success returns the bond; a proven violation sends it to you. Missing evidence holds it for review.",
                ],
              ].map(([n, title, copy]) => (
                <article className="panel about-card" key={n}>
                  <span className="step-number">{n}</span>
                  <h2>{title}</h2>
                  <p>{copy}</p>
                </article>
              ))}
              <p className="trust-note">
                MVP trust model: an authorized offchain verifier controls
                settlement. Collateral is not insurance against market losses.
              </p>
            </section>
          ) : (
            <>
              <section className="stats" aria-label="Your commitment totals">
                <div className="stat-card">
                  <span>
                    Agent collateral locked
                    <ShieldCheck size={17} />
                  </span>
                  <strong>
                    {amount(locked.toString())}
                    <small>USDC</small>
                  </strong>
                  <p>Backing your active commitments</p>
                </div>
                <div className="stat-card">
                  <span>
                    Commitments fulfilled
                    <Check size={17} />
                  </span>
                  <strong>
                    {settled
                      .filter((c) => c.status === "FULFILLED")
                      .length.toString()
                      .padStart(2, "0")}
                    <small>settled</small>
                  </strong>
                  <p>Verified against the approved promise</p>
                </div>
                <div className="stat-card">
                  <span>
                    Collateral received
                    <ArrowDownLeft size={18} />
                  </span>
                  <strong>
                    {amount(
                      history
                        .filter((c) => c.bondStatus === "SLASHED")
                        .reduce((s, c) => s + BigInt(c.bondAmount), 0n)
                        .toString(),
                    )}
                    <small>USDC</small>
                  </strong>
                  <p>Agent collateral sent to your wallet</p>
                </div>
              </section>
              {tab === "new" && (
                <div className="content-grid">
                  <section className="panel request-panel">
                    <div className="panel-heading">
                      <span className="section-icon">
                        <Sparkles size={18} />
                      </span>
                      <h2>
                        {current
                          ? "Your commitment"
                          : preview
                            ? "Here’s what your agent understood"
                            : "Create a commitment"}
                      </h2>
                      <span className="step-label">
                        {current
                          ? "03 / OUTCOME"
                          : preview
                            ? "02 / REVIEW"
                            : "01 / REQUEST"}
                      </span>
                    </div>
                    {!preview && !current && (
                      <>
                        <p className="panel-subtitle">
                          What do you want your agent to do?
                        </p>
                        <label className="sr-only" htmlFor="request">
                          Your financial request
                        </label>
                        <textarea
                          id="request"
                          value={request}
                          onChange={(e) => setRequest(e.target.value)}
                          placeholder={
                            "“Swap 1,000 USDC for ETH. Receive at least\n0.48 ETH within 5 minutes, sent to my treasury.”"
                          }
                          maxLength={2000}
                        />
                        <div className="input-footer">
                          <span>Be specific about the outcome.</span>
                          <span>{request.length}/2000</span>
                        </div>
                        <button
                          className="example-button"
                          onClick={() => setRequest(example)}
                        >
                          <Sparkles size={13} />
                          Try an example <ArrowUpRight size={13} />
                        </button>
                        <label className="field-label" htmlFor="recipient">
                          Treasury wallet{" "}
                          <span>Optional if your request names a wallet</span>
                        </label>
                        <input
                          id="recipient"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          placeholder="0x…"
                          autoComplete="off"
                        />
                        <div className="asset-flow">
                          <span className="token-icon usdc">$</span>
                          <span>USDC</span>
                          <ArrowRight size={16} />
                          <span className="token-icon eth">◆</span>
                          <span>ETH</span>
                          <span className="flow-caption">
                            One swap. A measurable promise.
                          </span>
                        </div>
                        <button
                          className="primary-button"
                          onClick={compile}
                          disabled={
                            !!busy || !canUse || request.trim().length < 10
                          }
                        >
                          {busy ? (
                            <LoaderCircle className="spin" size={17} />
                          ) : (
                            <Plus size={17} />
                          )}{" "}
                          {busy || "Create commitment"}
                          <ArrowRight size={17} />
                        </button>
                        <p className="footnote">
                          <ShieldCheck size={13} />
                          You’ll review the promise before anything moves.
                        </p>
                        {!wallet?.authenticated &&
                          health?.configured &&
                          health.mode !== "local" && (
                            <p className="connect-hint">
                              Connect your wallet to get started.
                            </p>
                          )}
                      </>
                    )}
                    {preview && (
                      <>
                        <p className="panel-subtitle">
                          Review these exact conditions before you approve.
                        </p>
                        <div className="terms">
                          <div>
                            <span>Swap amount</span>
                            <strong>
                              {amount(preview.mandate.amountIn)} USDC
                            </strong>
                          </div>
                          <div>
                            <span>Maximum spend</span>
                            <strong>
                              {amount(preview.mandate.maxSpend)} USDC
                            </strong>
                          </div>
                          <div>
                            <span>Minimum received</span>
                            <strong>
                              {amount(preview.mandate.minOutput, 18)} ETH
                            </strong>
                          </div>
                          <div>
                            <span>Recipient</span>
                            <strong className="address">
                              {preview.mandate.recipient}
                            </strong>
                          </div>
                          <div>
                            <span>Complete before</span>
                            <strong>
                              {new Date(
                                preview.mandate.deadline * 1000,
                              ).toLocaleTimeString()}
                            </strong>
                          </div>
                        </div>
                        <div className="bond-highlight">
                          <ShieldCheck size={22} />
                          <div>
                            <span>Agent collateral</span>
                            <strong>{amount(bond)} USDC</strong>
                            <p>The agent funds this. You don’t pay it.</p>
                          </div>
                          <span className="badge">Not locked yet</span>
                        </div>
                        <button
                          className="primary-button"
                          disabled={!!busy}
                          onClick={confirm}
                        >
                          {busy ? (
                            <LoaderCircle className="spin" size={17} />
                          ) : (
                            <ShieldCheck size={17} />
                          )}{" "}
                          {busy || "Approve commitment & lock bond"}
                          <ArrowRight size={17} />
                        </button>
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => setPreview(undefined)}
                        >
                          Back to request
                        </button>
                      </>
                    )}
                    {current && (
                      <>
                        <div className="result-title">
                          <StatusBadge c={current} />
                          <span className="mono">{short(current.id)}</span>
                        </div>
                        <h3 className="outcome-title">
                          {current.status === "FULFILLED"
                            ? "Your agent delivered."
                            : current.status === "FAILED"
                              ? "The promise wasn’t fulfilled."
                              : current.status === "CANCELLED"
                                ? "Commitment cancelled."
                                : current.verification?.bondAction === "HOLD"
                                  ? "Evidence needs review."
                                  : "A promise in progress."}
                        </h3>
                        <div className="outcome-values">
                          <div>
                            <span>
                              {current.evidence
                                ? "Actual ETH received"
                                : "Minimum ETH promised"}
                            </span>
                            <strong>
                              {amount(
                                current.evidence?.actualOutput ??
                                  current.mandate.minOutput,
                                18,
                              )}{" "}
                              <small>ETH</small>
                            </strong>
                          </div>
                          <div>
                            <span>
                              {current.evidence
                                ? "Actual USDC spent"
                                : "Maximum USDC spend"}
                            </span>
                            <strong>
                              {amount(
                                current.evidence?.actualSpend ??
                                  current.mandate.maxSpend,
                              )}{" "}
                              <small>USDC</small>
                            </strong>
                          </div>
                        </div>
                        {current.evidence && (
                          <p className="result-required">
                            Required: at least{" "}
                            {amount(current.mandate.minOutput, 18)} ETH by{" "}
                            {new Date(
                              current.mandate.deadline * 1000,
                            ).toLocaleTimeString()}
                          </p>
                        )}
                        <div
                          className={`bond-highlight ${current.bondStatus === "SLASHED" ? "slashed" : ""}`}
                        >
                          <ShieldCheck size={23} />
                          <div>
                            <span>
                              Agent collateral ·{" "}
                              {current.bondStatus.toLowerCase()}
                            </span>
                            <strong>{amount(current.bondAmount)} USDC</strong>
                            <p>
                              {current.bondStatus === "SLASHED"
                                ? "Transferred to your wallet."
                                : current.bondStatus === "RELEASED"
                                  ? "Returned to the agent."
                                  : current.bondStatus === "LOCKED"
                                    ? "Confirmed in the onchain bond contract."
                                    : "Waiting for the agent’s deposit."}
                            </p>
                          </div>
                        </div>
                        <ol className="timeline">
                          {current.timeline.map((event, i) => (
                            <li key={`${event.stage}-${i}`}>
                              <span className="timeline-check">
                                <Check size={11} />
                              </span>
                              <div>
                                {event.message}
                                <time>
                                  {new Date(event.at).toLocaleTimeString()}
                                </time>
                              </div>
                            </li>
                          ))}
                        </ol>
                        {current.verification?.reasons.length ? (
                          <div className="reason-box">
                            {current.verification.reasons.map((r) => (
                              <span key={r}>
                                {r.toLowerCase().replaceAll("_", " ")}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {!terminal(current) && (
                          <div className="action-stack">
                            {current.status === "CREATED" && (
                              <button
                                className="primary-button"
                                disabled={!!busy}
                                onClick={() =>
                                  task("Locking agent collateral", async () =>
                                    setCurrent(
                                      await api(
                                        `commitments/${current.id}/fund`,
                                        {},
                                      ),
                                    ),
                                  )
                                }
                              >
                                Resume bond funding
                                <ArrowRight size={17} />
                              </button>
                            )}
                            {(current.status === "FUNDED" ||
                              current.status === "ACTIVE") &&
                              !current.executionHash && (
                                <button
                                  className="primary-button"
                                  disabled={!!busy}
                                  onClick={execute}
                                >
                                  {busy ? (
                                    <LoaderCircle className="spin" size={17} />
                                  ) : (
                                    <Wallet size={17} />
                                  )}{" "}
                                  {busy || "Authorize swap"}
                                  <ArrowRight size={17} />
                                </button>
                              )}
                            {current.executionHash && (
                              <button
                                className="primary-button"
                                disabled={!!busy}
                                onClick={() =>
                                  task(
                                    "Checking confirmed evidence",
                                    async () =>
                                      setCurrent(
                                        await api(
                                          `commitments/${current.id}/settle`,
                                          {},
                                        ),
                                      ),
                                  )
                                }
                              >
                                {busy || "Check evidence & settle"}
                                <ArrowRight size={17} />
                              </button>
                            )}
                            {["CREATED", "FUNDED"].includes(current.status) && (
                              <button
                                className="text-button"
                                disabled={!!busy}
                                onClick={() =>
                                  task("Cancelling commitment", async () =>
                                    setCurrent(
                                      await api(
                                        `commitments/${current.id}/cancel`,
                                        {},
                                      ),
                                    ),
                                  )
                                }
                              >
                                Cancel commitment
                              </button>
                            )}
                          </div>
                        )}
                        {terminal(current) && (
                          <button className="primary-button" onClick={reset}>
                            <Plus size={17} />
                            Create another commitment
                            <ArrowRight size={17} />
                          </button>
                        )}
                        <details className="technical">
                          <summary>View technical details</summary>
                          <p>Recipient: {current.mandate.recipient}</p>
                          <p>Mandate hash: {current.mandateHash}</p>
                          {[
                            ["Bond deposit", current.fundingHash],
                            ["Execution", current.executionHash],
                            ["Settlement", current.settlementHash],
                          ]
                            .filter(([, h]) => h)
                            .map(([name, hash]) => (
                              <p key={name}>
                                {name}:{" "}
                                {health?.chainId === 8453 ? (
                                  <a
                                    href={`https://basescan.org/tx/${hash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {short(hash!)} <ExternalLink size={12} />
                                  </a>
                                ) : (
                                  hash
                                )}
                              </p>
                            ))}
                          <button
                            className="text-button"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(JSON.stringify(current, null, 2))
                                .catch(() =>
                                  setError("Clipboard is unavailable."),
                                )
                            }
                          >
                            <Copy size={13} />
                            Copy evidence record
                          </button>
                        </details>
                      </>
                    )}
                    {questions.length > 0 && (
                      <div className="question-box">
                        <strong>A few details are missing</strong>
                        {questions.map((q) => (
                          <p key={q}>{q}</p>
                        ))}
                        <p>
                          Add these details to your request, then try again.
                        </p>
                      </div>
                    )}
                    {(error || current?.error) && (
                      <div className="error-box" role="alert">
                        <X size={16} />
                        <span>{error || current?.error}</span>
                      </div>
                    )}
                  </section>
                  <aside className="right-column">
                    <div className="promise-card">
                      <div className="promise-top">
                        <ShieldCheck size={24} />
                        <span>THE CREDIBLEEXEC DIFFERENCE</span>
                      </div>
                      <h2>
                        Permission is good.
                        <br />
                        Accountability
                        <br />
                        is better.
                      </h2>
                      <p>
                        Your agent doesn’t just get permission to act. It puts
                        its own collateral behind a clear financial promise.
                      </p>
                      <div className="promise-divider" />
                      <div className="promise-row">
                        <span className="promise-symbol">
                          <Check size={16} />
                        </span>
                        <div>
                          <strong>Promise kept</strong>
                          <span>Collateral returns to the agent.</span>
                        </div>
                      </div>
                      <div className="promise-row">
                        <span className="promise-symbol">
                          <ArrowDownLeft size={17} />
                        </span>
                        <div>
                          <strong>Promise violated</strong>
                          <span>The agent’s collateral goes to you.</span>
                        </div>
                      </div>
                      <span className="promise-note">
                        YOUR FUNDS AND AGENT COLLATERAL STAY SEPARATE
                      </span>
                    </div>
                    <div className="flow-card">
                      <h3>From intent to evidence</h3>
                      {[
                        ["01", "You set the goal"],
                        ["02", "Agent backs its promise"],
                        ["03", "You authorize the swap"],
                        ["04", "The outcome settles it"],
                      ].map(([n, t]) => (
                        <div key={n}>
                          <span>{n}</span>
                          {t}
                          <Check size={14} />
                        </div>
                      ))}
                      <button onClick={() => setTab("about")}>
                        Understand the process
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </aside>
                </div>
              )}
              <section className="panel history-panel">
                <div className="history-heading">
                  <div>
                    <h2>
                      {tab === "history"
                        ? "Commitment history"
                        : "Recent commitments"}
                    </h2>
                    <p>Real promises. Verifiable outcomes.</p>
                  </div>
                  {tab === "new" && (
                    <button
                      className="text-button"
                      onClick={() => setTab("history")}
                    >
                      View all
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <div className="empty-state">
                    <span>
                      <History size={23} />
                    </span>
                    <div>
                      <strong>Your first commitment starts here</strong>
                      <p>
                        Once you approve a promise, its progress and outcome
                        will appear here.
                      </p>
                    </div>
                    <button
                      onClick={reset}
                      aria-label="Create your first commitment"
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Commitment</th>
                          <th>Minimum outcome</th>
                          <th>Agent collateral</th>
                          <th>Status</th>
                          <th aria-label="Open" />
                        </tr>
                      </thead>
                      <tbody>
                        {(tab === "new" ? history.slice(0, 5) : history).map(
                          (c) => (
                            <tr key={c.id}>
                              <td>
                                <button
                                  className="history-link"
                                  onClick={() => {
                                    setCurrent(c);
                                    setPreview(undefined);
                                    setTab("new");
                                    setError("");
                                  }}
                                >
                                  <span className="token-icon usdc">$</span>
                                  <span>
                                    {amount(c.mandate.amountIn)} USDC → ETH
                                    <small>
                                      {new Date(
                                        c.createdAt,
                                      ).toLocaleDateString()}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td>≥ {amount(c.mandate.minOutput, 18)} ETH</td>
                              <td>{amount(c.bondAmount)} USDC</td>
                              <td>
                                <StatusBadge c={c} />
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label="Open commitment"
                                  onClick={() => {
                                    setCurrent(c);
                                    setPreview(undefined);
                                    setTab("new");
                                  }}
                                >
                                  <ArrowUpRight size={16} />
                                </button>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
          <footer>
            <span>
              <ShieldCheck size={14} />A clear promise. A real stake. A
              verifiable outcome.
            </span>
            <div>
              Bazantic<span>·</span>Privy<span>·</span>1inch
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
