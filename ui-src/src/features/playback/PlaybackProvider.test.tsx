import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "./PlaybackProvider";
import { getJobAudio } from "@/lib/api";

vi.mock("@/lib/api", async (load) => {
  const actual = await load<typeof import("@/lib/api")>();
  return { ...actual, getJobAudio: vi.fn() };
});

describe("PlaybackProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    vi.mocked(getJobAudio).mockResolvedValue(new Blob(["audio"]));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  it("loads one requested job into the persistent dock", async () => {
    render(<PlaybackProvider><div>Route content</div></PlaybackProvider>);
    fireEvent(window, new CustomEvent("vox:play-job", { detail: {
      request_id: "job-1", text: "Morning update. More detail.", voice_name: "Noel Demo",
      audio_duration_s: 42, file_available: true,
    } }));
    await waitFor(() => expect(getJobAudio).toHaveBeenCalledWith("job-1"));
    expect(await screen.findByRole("region", { name: "Audio player" })).toBeInTheDocument();
    expect(screen.getByText("Morning update")).toBeInTheDocument();
    expect(screen.getByLabelText("Seek audio")).toBeInTheDocument();
  });

  it("restores metadata paused without attempting autoplay", () => {
    localStorage.setItem("vox:last-playback-item", JSON.stringify({
      request_id: "job-2", text: "Restored clip", voice_name: "Maya", audio_duration_s: 12, file_available: true,
    }));
    render(<PlaybackProvider><div /></PlaybackProvider>);
    expect(screen.getByText("Restored clip")).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("keeps the latest selection when audio requests resolve out of order", async () => {
    let resolveFirst!: (blob: Blob) => void;
    let resolveSecond!: (blob: Blob) => void;
    vi.mocked(getJobAudio)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    render(<PlaybackProvider><div /></PlaybackProvider>);
    fireEvent(window, new CustomEvent("vox:play-job", { detail: { request_id: "slow", text: "Slow clip", voice_name: null, audio_duration_s: 1, file_available: true } }));
    fireEvent(window, new CustomEvent("vox:play-job", { detail: { request_id: "fast", text: "Fast clip", voice_name: null, audio_duration_s: 1, file_available: true } }));
    resolveSecond(new Blob(["fast"]));
    expect(await screen.findByText("Fast clip")).toBeInTheDocument();
    resolveFirst(new Blob(["slow"]));
    await waitFor(() => expect(screen.queryByText("Slow clip")).not.toBeInTheDocument());
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("lazily fetches a restored item when Play is pressed", async () => {
    localStorage.setItem("vox:last-playback-item", JSON.stringify({ request_id: "restored", text: "Restored audio", voice_name: null, audio_duration_s: 8, file_available: true }));
    render(<PlaybackProvider><div /></PlaybackProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(getJobAudio).toHaveBeenCalledWith("restored"));
  });
});
