"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientView } from "@/lib/views";
import { CARDINAL, CLASSES, className, gravity, order } from "@/lib/taxonomy";
import { PapalBull } from "./PapalBull";

interface Props { view: ClientView; busy: boolean; error: string | null; onPay(): void; onDispense(): void; onSummon(): void }

/** What lies blurred under the Papal Bull: the server withholds Malphas's verdict until he is summoned. */
const CONFITEOR = "Confiteor Deo omnipotenti, beatae Mariae semper Virgini, beato Michaeli Archangelo, beato Ioanni Baptistae, sanctis Apostolis Petro et Paulo, et omnibus Sanctis, quia peccavi nimis cogitatione, verbo et opere: mea culpa, mea culpa, mea maxima culpa. Ideo precor beatam Mariam semper Virginem, beatum Michaelem Archangelum, beatum Ioannem Baptistam, sanctos Apostolos Petrum et Paulum, omnes Sanctos, orare pro me ad Dominum Deum nostrum.";

export function SealedVerdict({ view, busy, error, onSummon }: Props) {
  return (
    <div className="sealed">
      <article className="manuscript" aria-hidden="true">
        <p className="kicker smallcaps">Casus Reservatus</p>
        <h2 className="blackletter">Peccatum Reservatum</h2>
        <p className="classis smallcaps">Ordo Abyssi · Class VII, Abomination</p>
        <p className="sermon"><span className="initial">C</span>{CONFITEOR.slice(1)} {CONFITEOR}</p>
      </article>
      <PapalBull price={view.price} busy={busy} error={error} onSummon={onSummon} />
    </div>
  );
}

/** The sermon is inked word by word, as if the scribe were still writing. */
function useInk(words: number, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? 0 : words);
  useEffect(() => {
    if (!enabled) { setShown(words); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setShown(words); return; }
    let current = 0;
    const timer = setInterval(() => { current += 2; setShown(current); if (current >= words) clearInterval(timer); }, 55);
    return () => clearInterval(timer);
  }, [words, enabled]);
  return shown;
}

export function Verdict({ view, busy, error, onPay, onDispense }: Props) {
  const verdict = view.verdict!;
  const abyssal = view.tier === "abyssal";
  const eater = abyssal ? "Malphas" : "the Gargoyle";
  const chosen = order(verdict.sin.order);
  const words = useMemo(() => verdict.roast.split(/\s+/).filter(Boolean), [verdict.roast]);
  const shown = useInk(words.length, true);
  const [first, ...rest] = words;
  const initial = first?.[0] ?? "";
  return (
    <article className={`manuscript ${abyssal ? "abyssal" : ""}`} aria-labelledby="verdict-title">
      <p className="kicker smallcaps">{abyssal ? "The judgment of Malphas, Arch-Prelate of the Abyss" : "The judgment of the Inquisitor"}</p>
      <h2 id="verdict-title" className="blackletter">{verdict.title}</h2>
      <p className="classis smallcaps">
        {chosen.latin} · {CARDINAL[verdict.sin.cardinal].latin} ({CARDINAL[verdict.sin.cardinal].english}) · {className(verdict.sin.severity)}, {CLASSES[verdict.sin.severity - 1]} · a {gravity(verdict.sin.severity)} sin
      </p>
      <div className="body">
        <p className="sermon">
          <span className="initial" aria-hidden="true">{initial}</span>
          <span className="visually-hidden">{verdict.roast}</span>
          <span aria-hidden="true">
            <span className={`ink ${shown > 0 ? "on" : ""}`}>{first?.slice(1)} </span>
            {rest.map((word, index) => <span key={index} className={`ink ${index + 1 < shown ? "on" : ""}`}>{word} </span>)}
          </span>
        </p>
        {verdict.evidence.length > 0 && (
          <ul className="glosses" aria-label="The evidence read from thy confession">
            {verdict.evidence.map((item, index) => (
              <li key={index} style={{ animationDelay: `${0.6 + index * 0.45}s` }}>
                <span className="hand" aria-hidden="true">☞</span>
                <span className="value">{item.value}</span>
                <span className="detail">{item.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {verdict.penance && <p className="penance"><strong>Penance.</strong> {verdict.penance}</p>}
      {view.companions > 0 && <p className="comfort">Thou art not alone: {view.companions === 1 ? "one other soul was" : `${view.companions} souls were`} absolved of <em>{chosen.latin}</em> this week.</p>}
      {view.payable && (
        <div className="offering">
          <button type="button" className={`seal ${abyssal ? "abyssal" : ""}`} onClick={onPay} disabled={busy} aria-busy={busy} aria-label={`Feed it to ${eater} for ${view.price}`}>
            {abyssal ? <span>Feed it to<br />Malphas<strong>{view.price}</strong></span> : <span>Feed it to the<br />Gargoyle<strong>{view.price}</strong></span>}
          </button>
          <div>
            <p>{abyssal
              ? `For ${view.price} Malphas devours thy evidence in hellfire, the server destroys its sealed copy, and thou receivest the Black Seal of Absolution for thy wallet.`
              : `For ${view.price} the Gargoyle devours thy evidence in fire, the server destroys its sealed copy, and thou receivest a signed Certificate of Absolution for thy wallet.`}</p>
            {view.canDispense && <p style={{ marginTop: 12 }}><button type="button" className="plaque light" onClick={onDispense} disabled={busy}>Grant a dispensation (development)</button></p>}
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
