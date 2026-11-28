import type { Metadata } from "next";
import Shell from "@/components/Shell";
import SettingsView from "@/components/SettingsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings — REELAY",
  description: "Account and email delivery settings.",
};

export default function SettingsPage() {
  return (
    <Shell>
      <SettingsView />
    </Shell>
  );
}
