import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/logs")({
  beforeLoad: () => { throw redirect({ to: "/app/settings/$tab", params: { tab: "diagnostics" }, replace: true }); },
});
