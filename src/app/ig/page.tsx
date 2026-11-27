import type { Metadata } from "next";
import Shell from "@/components/Shell";
import IgView from "@/components/IgView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Link Instagram — REELAY",
  description: "Connect Instagram with one Zernio API key — no Meta app, no OAuth.",
};

export default function IgPage() {
  return (
    <Shell>
      <IgView />
    </Shell>
  );
}
