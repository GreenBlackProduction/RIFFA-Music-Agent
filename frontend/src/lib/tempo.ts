/** Word-coded tempo → numeric BPM range; numeric tempos normalised; else as-is. */
export function formatBpm(tempo?: string | null): string {
  if (!tempo) return "";
  const t = tempo.trim().toLowerCase();
  const map: Record<string, string> = {
    very_slow: "60–80 BPM",
    slow: "80–100 BPM",
    medium: "100–120 BPM",
    mid: "100–120 BPM",
    fast: "120–140 BPM",
    very_fast: "140–180 BPM",
  };
  if (map[t]) return map[t];
  const num = t.replace(/bpm/g, "").trim();
  if (/^\d+\s*[-–]\s*\d+$/.test(num)) return num.replace(/\s*-\s*/, "–") + " BPM";
  if (/^\d+$/.test(num)) return num + " BPM";
  return tempo;
}
