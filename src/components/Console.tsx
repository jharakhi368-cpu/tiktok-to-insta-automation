"use client";

import { useConsole } from "./console-context";
import IntakeRail from "./IntakeRail";
import EditBay from "./EditBay";

export default function ConsoleView() {
  const c = useConsole();
  const selected = c.videos.find((v) => v.id === c.selectedId) ?? null;

  return (
    <>
      <section className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r lg:overflow-y-auto">
        <IntakeRail
          videos={c.videos}
          selectedId={c.selectedId}
          onSelect={c.setSelectedId}
          onIntake={c.intake}
          loading={c.loading}
        />
      </section>

      <section className="min-h-0 lg:overflow-y-auto">
        <EditBay
          video={selected}
          now={c.now}
          busy={c.busy}
          onChange={c.patch}
          onQueue={c.queue}
          onPublish={c.publish}
          onDelete={c.remove}
          onCover={c.uploadCover}
          onReset={() => c.setSelectedId(null)}
        />
      </section>
    </>
  );
}
