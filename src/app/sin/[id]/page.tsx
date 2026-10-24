import { notFound } from "next/navigation";
import { Footer, Topbar } from "@/components/Chrome";
import { Ritual } from "@/components/Ritual";
import { SoundToggle } from "@/components/SoundToggle";
import { SIN_ID } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function SinPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string | string[] }> }) {
  const { id } = await params;
  const { paid } = await searchParams;
  if (!SIN_ID.test(id)) notFound();
  return (
    <main>
      <div className="shell">
        <Topbar />
        <Ritual id={id} paid={typeof paid === "string" ? paid : null} />
        <Footer />
      </div>
      <SoundToggle />
    </main>
  );
}
