import type { Metadata } from "next";
import Shell from "@/components/Shell";
import CalendarView from "@/components/CalendarView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendar — REELAY",
  description: "See which day every reel was published.",
};

export default function CalendarPage() {
  return (
    <Shell>
      <CalendarView />
    </Shell>
  );
}
