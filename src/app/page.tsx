import type { Metadata } from "next";
import Shell from "@/components/Shell";
import ConsoleView from "@/components/Console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Console — REELAY",
  description: "Telegram intake, cover frame, caption and air time for one clip.",
};

export default function Page() {
  return (
    <Shell variant="console">
      <ConsoleView />
    </Shell>
  );
}
