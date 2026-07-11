import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/recordings")({
  beforeLoad: () => { throw redirect({ to: "/app/history", replace: true }); },
});
