import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { AudioVisualizer } from "@/lib/audio-visualizer";

export interface AudioVisualizerHandle {
  startMicrophone(): Promise<void>;
  connectStream(stream: MediaStream): void;
  connectAudioElement(el: HTMLAudioElement): void;
  stop(): void;
  setStaticBars(peaks: number[]): void;
  destroy(): void;
}

interface Props {
  className?: string;
}

const AudioVisualizerCanvas = forwardRef<AudioVisualizerHandle, Props>(
  ({ className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const vizRef    = useRef<AudioVisualizer | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      vizRef.current = new AudioVisualizer(canvas);
      return () => {
        vizRef.current?.destroy();
        vizRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      startMicrophone:     ()       => vizRef.current!.startMicrophone(),
      connectStream:       (s)      => vizRef.current?.connectStream(s),
      connectAudioElement: (el)     => vizRef.current?.connectAudioElement(el),
      stop:                ()       => vizRef.current?.stop(),
      setStaticBars:       (peaks)  => vizRef.current?.setStaticBars(peaks),
      destroy:             ()       => vizRef.current?.destroy(),
    }));

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    );
  },
);

AudioVisualizerCanvas.displayName = "AudioVisualizerCanvas";
export default AudioVisualizerCanvas;
