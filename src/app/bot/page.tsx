import type { Metadata } from "next";
import Shell from "@/components/Shell";
import BotView from "@/components/BotView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Link bot — REELAY",
  description: "Connect your Telegram bot token and get every REELAY feature as a button.",
};

export default function BotPage() {
  return (
    <Shell>
      <BotView />
    </Shell>
  );
}
