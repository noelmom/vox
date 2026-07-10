import { createFileRoute } from "@tanstack/react-router";
import { DiagnosticsSettings, SettingsPage } from "@/features/settings/SettingsPage";

export const Route = createFileRoute("/app/settings/$tab")({
  head: ({ params }) => ({ meta: [{ title: `${params.tab} settings — Vox Studio` }] }),
  component: SettingsTab,
});

function SettingsTab() {
  const { tab } = Route.useParams();
  return tab === "diagnostics" ? <DiagnosticsSettings /> : <SettingsPage />;
}
