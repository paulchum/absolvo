"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ritualAudio } from "@/lib/client/audio";
import type { ClientView } from "@/lib/views";
import { CertificateReveal } from "./CertificateReveal";
import { Candles } from "./Chrome";
import { Consumption, type Absolution } from "./Consumption";
import { Examination } from "./Examination";
import { Gargoyle } from "./Gargoyle";
import { SealedVerdict, Verdict } from "./Verdict";

async function call(url: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const response = await fetch(url, method === "POST" ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) } : { cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as ClientView & { error?: string; url?: string };
  if (!response.ok) throw Object.assign(new Error(json.error || "The altar faltered. Try again."), { status: response.status });
  return json;
}

export function Ritual({ id, paid }: { id: string; paid: string | null }) {
  const [view, setView] = useState<ClientView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [absolution, setAbsolution] = useState<Absolution | null>(null);
  const judging = useRef(false);
  const confirming = useRef(false);
  const recoiled = useRef(false);

  useEffect(() => { call(`/api/sins/${id}`).then(setView).catch(caught => setFatal(caught.message)); }, [id]);

  const judge = useCallback(async () => {
    judging.current = true;
    setError(null);
    try { setView(await call(`/api/sins/${id}/judge`, "POST")); }
    catch (caught) {
      if ((caught as { status?: number }).status !== 409) { setError((caught as Error).message); judging.current = false; return; }
      for (let attempt = 0; attempt < 100; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const next = await call(`/api/sins/${id}`).catch(() => null);
        if (next && next.status !== "uploaded" && next.status !== "judging") { setView(next); break; }
      }
    }
    judging.current = false;
  }, [id]);

  useEffect(() => {
    if (!view) return;
    if ((view.status === "uploaded" || view.status === "judging") && !judging.current && !error) void judge();
    if (view.sealed && !recoiled.current) { recoiled.current = true; ritualAudio().horn(); }
    if (view.status === "damned" && !recoiled.current) { recoiled.current = true; ritualAudio().horn(); ritualAudio().growl(1.5, 0.35); }
    if ((view.status === "judged" || view.status === "abyssal_required") && paid && !confirming.current) {
      confirming.current = true;
      (async () => {
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            const next = await call(`/api/sins/${id}/confirm`, "POST", { session: paid });
            if (next.paid) { setView(next); break; }
          } catch (caught) { setError((caught as Error).message); break; }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        window.history.replaceState(null, "", `/sin/${id}`);
      })();
    }
  }, [view, error, judge, id, paid]);

  async function pay() {
    setBusy(true);
    setError(null);
    try { const { url } = await call(`/api/sins/${id}/checkout`, "POST"); if (url) window.location.assign(url); }
    catch (caught) { setError((caught as Error).message); setBusy(false); }
  }
  async function summon() {
    setBusy(true);
    setError(null);
    try { setView(await call(`/api/sins/${id}/summon`, "POST")); ritualAudio().growl(1.3, 0.5); }
    catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  async function dispense() {
    setBusy(true);
    setError(null);
    try { setView(await call(`/api/sins/${id}/bypass`, "POST")); }
    catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }

  if (fatal) {
    return (
      <section className="document manuscript">
        <h2 className="blackletter">No such sin</h2>
        <p>{fatal} Confessions belong to the browser that made them, and crumble after a day if unpaid.</p>
        <Link href="/">Return to the altar ☞</Link>
      </section>
    );
  }
  if (!view) return <div className="ritual"><div className="stage"><Gargoyle open={0.1} /></div><p className="italic">Unrolling the scroll…</p></div>;

  if (view.status === "paid") return <Consumption view={view} onAbsolved={result => { setAbsolution(result); setView(result.view); }} />;
  if (view.status === "consumed" && view.certificate) return <CertificateReveal view={view} serial={view.certificate} receipt={absolution?.receipt ?? view.receipt} />;

  const open = view.status === "judged" || (view.status === "abyssal_required" && !view.sealed);
  const damned = view.status === "damned";
  const abyssal = (view.tier === "abyssal" && !view.sealed) || view.status === "refused" || damned;
  const recoiling = view.sealed || view.status === "refused";
  return (
    <div className="ritual">
      <div className="stage">
        <Gargoyle variant={abyssal ? "abyssal" : "parish"} mood={recoiling ? "recoil" : "calm"} hungry={open} open={open ? 0.32 : recoiling ? 0.04 : damned ? 0.5 : 0.1} fire={view.status === "uploaded" || view.status === "judging" ? 0.35 : damned ? 0.9 : 0} />
        <Candles crimson={view.tier === "abyssal" || view.sealed} />
      </div>
      <div>
        {(view.status === "uploaded" || view.status === "judging") && <Examination error={error} onRetry={() => void judge()} />}
        {view.sealed && <SealedVerdict view={view} busy={busy} error={error} onPay={pay} onDispense={dispense} onSummon={summon} />}
        {open && view.verdict && <Verdict view={view} busy={busy} error={error} onPay={pay} onDispense={dispense} onSummon={summon} />}
        {view.status === "refused" && (
          <article className="manuscript scorched">
            <p className="kicker smallcaps">Ordo Abyssi</p>
            <h2 className="abyss-title">THE ABYSS REJECTS THY SACRIFICE</h2>
            <p className="sermon">Even Malphas refuses to chew upon this scroll.</p>
            <p>Nothing was charged, and the evidence hath already been destroyed.</p>
            <Link href="/" style={{ color: "var(--rubric)" }}>Confess something else ☞</Link>
          </article>
        )}
        {damned && (
          <article className="manuscript scorched damnation">
            <p className="kicker smallcaps">Ordo Abyssi · Sententia</p>
            <h2 className="abyss-title">NO ABSOLUTION FOR THEE</h2>
            <p className="sermon">Thou art going to Hell.</p>
            <p>Nothing was charged, and the evidence hath already been destroyed.</p>
            <Link href="/" style={{ color: "var(--rubric)" }}>Begone ☞</Link>
          </article>
        )}
        {view.status === "expired" && (
          <article className="manuscript">
            <h2 className="blackletter">Crumbled to dust</h2>
            <p>Unpaid confessions are destroyed after a day. The Gargoyle never tasted this one.</p>
            <Link href="/" style={{ color: "var(--rubric)" }}>Confess anew ☞</Link>
          </article>
        )}
        {view.status === "consumed" && !view.certificate && <p>The certificate is being pressed… reload in a moment.</p>}
      </div>
    </div>
  );
}
