import type { Metadata } from "next";
import Shell from "@/components/Shell";
import ConsoleView from "@/components/Console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Console — REELAY",
  description: "Create a reel: pick the cover, write the caption, set the air time.",
};

export default function Page() {
  return (
    <Shell variant="console">
      <ConsoleView />
    </Shell>
  );
}
