"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ConfessionError, normalizeImage } from "@/lib/client/normalize";
import { saveRelic } from "@/lib/client/relic-store";

type Mode = "image" | "text";
const IN_APP = /FBAN|FBAV|Instagram|TikTok|musical_ly|Line\/|Snapchat|Twitter|LinkedInApp|Pinterest/i;

export function Altar({ price }: { price: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("image");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inApp, setInApp] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setInApp(IN_APP.test(navigator.userAgent)); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(next: File | undefined | null) {
    setError(null);
    if (!next) return;
    if (!/^image\//.test(next.type) && !/\.(heic|heif|png|jpe?g|webp|gif)$/i.test(next.name)) { setError("The Gargoyle eats only images. For words, choose “Speak thy sin”."); return; }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    setHover(false);
    choose(event.dataTransfer.files?.[0]);
  }

  async function confess() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("localTime", new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      form.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone || "");
      let relic: Parameters<typeof saveRelic>[1];
      if (mode === "image") {
        if (!file) throw new ConfessionError("Lay thy evidence upon the altar first.");
        const prepared = await normalizeImage(file);
        form.set("file", prepared.blob, "confession.jpg");
        relic = { kind: "image", blob: prepared.blob, savedAt: Date.now() };
      } else {
        if (text.trim().length < 3) throw new ConfessionError("Speak at least a few words, penitent.");
        form.set("text", text.trim());
        relic = { kind: "text", text: text.trim(), savedAt: Date.now() };
      }
      const response = await fetch("/api/sins", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new ConfessionError(body.error || "The altar faltered. Try again.");
      await saveRelic(body.id, relic);
      router.push(`/sin/${body.id}`);
    } catch (caught) {
      setError(caught instanceof ConfessionError ? caught.message : "The altar faltered. Try again.");
      setBusy(false);
    }
  }

  return (
    <section className="altar" aria-labelledby="altar-title">
      <h2 id="altar-title" className="visually-hidden">Make thy confession</h2>
      {inApp && <p className="error" role="note">Thou art inside another app&apos;s browser. Open Absolvo in Safari or Chrome: in-app browsers lose thy key and cannot carry passes to thy wallet.</p>}
      <div className="tabs" role="tablist" aria-label="Kind of confession">
        <button className="tab" role="tab" aria-selected={mode === "image"} onClick={() => setMode("image")}>Show thine evidence</button>
        <button className="tab" role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")}>Speak thy sin</button>
      </div>
      <div className="slip">
        {mode === "image" ? (
          <div className={`dropzone ${hover ? "hover" : ""}`} onDragOver={event => { event.preventDefault(); setHover(true); }} onDragLeave={() => setHover(false)} onDrop={drop}>
            {file && preview ? (
              <div className="preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Thy evidence" />
                <div>
                  <p className="smallcaps" style={{ margin: 0 }}>The evidence is laid upon the altar</p>
                  <p style={{ margin: "6px 0 12px" }}>{file.name}</p>
                  <button type="button" className="plaque light" onClick={() => { setFile(null); setPreview(null); if (input.current) input.current.value = ""; }}>Choose another</button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="blackletter">Lay thy evidence here</h2>
                <p>A screenshot of thy 2 AM text, thy $55 burrito receipt, thy screen-time report.<br />Drop it, or touch to choose.</p>
                <span className="smallcaps muted" style={{ fontSize: 14 }}>PNG · JPEG · WebP · HEIC in Safari</span>
                <input ref={input} type="file" accept="image/*" aria-label="Choose an image to confess" onChange={event => choose(event.target.files?.[0])} />
              </div>
            )}
          </div>
        ) : (
          <label>
            <span className="visually-hidden">Thy confession</span>
            <textarea className="confession-text" maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder="Forgive me, Gargoyle, for I have sinned. At 2:13 in the morning I…" />
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="altar-actions">
        <button className="seal" onClick={confess} disabled={busy} aria-busy={busy} aria-label={busy ? "Bearing thy confession to the Inquisitor" : "Present it to the Inquisitor"}>
          <span>{busy ? "Bearing it to the Inquisitor…" : <>Present it to the<br />Inquisitor</>}</span>
        </button>
        <p className="fine">The roast is free. Absolution — the Gargoyle eats it, thy evidence is destroyed, a certificate for thy wallet — costs {price}.</p>
      </div>
    </section>
  );
}
