/** Square-wave cursor blink: 1 s period, 55% on. Solid while typing. */
export function cursorOn(frame: number, fps: number, typing: boolean, phase = 0): boolean {
  if (typing) return true;
  const t = ((frame + phase) / fps) % 1;
  return t < 0.55;
}
