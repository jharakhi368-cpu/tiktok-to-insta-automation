import type { Metadata } from "next";
import Shell from "@/components/Shell";
import PostedView from "@/components/PostedView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Posted — REELAY",
  description: "Feed history: every clip that went out, cover, caption and media id.",
};

export default function PostedPage() {
  return (
    <Shell>
      <PostedView />
    </Shell>
  );
}
