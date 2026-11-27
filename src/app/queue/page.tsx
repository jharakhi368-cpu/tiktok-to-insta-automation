import type { Metadata } from "next";
import Shell from "@/components/Shell";
import QueueView from "@/components/QueueView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Queue — REELAY",
  description: "Everything scheduled to post, with its time and controls.",
};

export default function QueuePage() {
  return (
    <Shell>
      <QueueView />
    </Shell>
  );
}
