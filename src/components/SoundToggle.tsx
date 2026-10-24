"use client";

import { useEffect, useState } from "react";
import { ritualAudio, soundPreference } from "@/lib/client/audio";

/** Sound is opt-in: enabling it may override the iPhone silent switch, so it waits for a deliberate tap. */
export function SoundToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(soundPreference() && ritualAudio().enabled); }, []);
  function toggle() {
    const audio = ritualAudio();
    if (on) { audio.disable(); setOn(false); return; }
    void audio.enable();
    audio.bell();
    setOn(true);
  }
  return (
    <button type="button" className="plaque sound" aria-pressed={on} onClick={toggle} title="The rite is best heard with headphones">
      {on ? "♫ The rite is heard" : "♪ Let the rite be heard"}
    </button>
  );
}

/** Called inside a tap: resumes sound for a penitent who chose it before. */
export function wakeSound() {
  if (soundPreference()) void ritualAudio().enable();
}
