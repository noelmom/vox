import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/library")({
  beforeLoad: () => { throw redirect({ to: "/app/voices", replace: true }); },
});
