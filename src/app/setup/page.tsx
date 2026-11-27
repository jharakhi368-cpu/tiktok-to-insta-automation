import type { Metadata } from "next";
import Shell from "@/components/Shell";
import SetupView from "@/components/SetupView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Go live — REELAY",
  description: "The eight steps to host REELAY permanently, free, with no credit card.",
};

export default function SetupPage() {
  return (
    <Shell>
      <SetupView />
    </Shell>
  );
}
