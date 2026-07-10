import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const Route = createFileRoute("/app/settings/$tab")({
  head: ({ params }) => ({ meta: [{ title: `${params.tab} settings — Vox Studio` }] }),
  component: SettingsPage,
});
