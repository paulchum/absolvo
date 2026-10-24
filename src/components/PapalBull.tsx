"use client";

import { useEffect, useRef } from "react";

interface Props { price: string; busy: boolean; error: string | null; onSummon(): void }

/** Laid over the blurred manuscript when the parish recoils; summoning Malphas breaks it. */
export function PapalBull({ price, busy, error, onSummon }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="bull-veil">
      <section className="bull" role="alertdialog" aria-modal="true" aria-labelledby="bull-title" aria-describedby="bull-body">
        <p className="bull-incipit smallcaps" aria-hidden="true">Bulla · Casus Reservatus</p>
        <h2 id="bull-title">THE PARISH INQUISITOR HATH RECOILED</h2>
        <p id="bull-body" className="bull-body">
          <em>Thy transgression is too foul for the common altar. The parish gargoyle refuses to put this filth in its mouth. To absolve a Reserved Sin of this magnitude, thou must summon <strong>MALPHAS, ARCH-PRELATE OF THE ABYSS</strong>.</em>
        </p>
        <button ref={button} type="button" className="plaque summon" onClick={onSummon} disabled={busy} aria-busy={busy}>
          Summon the Arch-Prelate ({price})
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        <span className="bulla" aria-hidden="true">✠</span>
      </section>
    </div>
  );
}
