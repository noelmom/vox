import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const Route = createFileRoute("/app/settings/")({
  head: () => ({ meta: [{ title: "Settings — Vox Studio" }] }),
  component: SettingsPage,
});
