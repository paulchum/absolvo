import type { Metadata } from "next";
import { Footer, Topbar } from "@/components/Chrome";
import { Graveyard } from "@/components/Graveyard";
import { SoundToggle } from "@/components/SoundToggle";
import { startScheduler } from "@/lib/scheduler";
import { census, recent } from "@/lib/wall";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The Graveyard of Sins — Absolvo", description: "Every sin the Gargoyle has eaten, carved in stone as it happens." };

export default function GraveyardPage() {
  startScheduler();
  return (
    <main>
      <div className="shell">
        <Topbar />
        <Graveyard initial={recent({ limit: 36 })} census={census()} />
        <Footer />
      </div>
      <SoundToggle />
    </main>
  );
}
