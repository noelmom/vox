export type GenerationStatus =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "polling"; requestId: string; startedAt: number; status?: DurableGenerationState }
  | { phase: "done"; requestId?: string }
  | { phase: "error"; requestId?: string; message: string }
  | { phase: "cancelled"; requestId?: string };

export type DurableGenerationState =
  | "queued"
  | "processing"
  | "cancelling"
  | "encoding"
  | "recovering";

const GENERATION_EVENT = "vox:generation-change";

let current: GenerationStatus = { phase: "idle" };

export function getGenerationState(): GenerationStatus {
  return current;
}

export function setGenerationState(next: GenerationStatus) {
  current = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GENERATION_EVENT, { detail: next }));
  }
}

export function subscribeGenerationState(handler: (state: GenerationStatus) => void) {
  const listener = (event: Event) => {
    handler((event as CustomEvent<GenerationStatus>).detail);
  };
  window.addEventListener(GENERATION_EVENT, listener as EventListener);
  return () => window.removeEventListener(GENERATION_EVENT, listener as EventListener);
}
