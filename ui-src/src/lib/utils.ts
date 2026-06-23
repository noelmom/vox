import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function strToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
  return h % 360;
}

export function tagStyle(tag: string): React.CSSProperties {
  const hue = strToHue(tag);
  return {
    background: `oklch(0.94 0.07 ${hue})`,
    color: `oklch(0.38 0.12 ${hue})`,
  };
}
