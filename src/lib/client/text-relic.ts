/** A typed confession, written out on a parchment slip so the Gargoyle has something to burn. */
export async function textRelic(text: string, width = 720, height = 960) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(width / 2, height * 0.4, width * 0.2, width / 2, height / 2, width * 0.9);
  gradient.addColorStop(0, "#f1e6cc");
  gradient.addColorStop(1, "#cdb88d");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(22,17,13,0.4)";
  context.lineWidth = 3;
  context.strokeRect(24, 24, width - 48, height - 48);
  const styles = getComputedStyle(document.body);
  const blackletter = styles.getPropertyValue("--font-black").trim() || "serif";
  const fell = styles.getPropertyValue("--font-fell").trim() || "serif";
  context.fillStyle = "#a3241a";
  context.font = `104px ${blackletter}`;
  context.textAlign = "center";
  context.fillText("Confessio", width / 2, 138);
  context.fillStyle = "#16110d";
  context.textAlign = "left";
  context.font = `italic 52px ${fell}`;
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (context.measureText(attempt).width > width - 120 && line) { lines.push(line); line = word; } else line = attempt;
  }
  if (line) lines.push(line);
  lines.slice(0, 12).forEach((entry, index) => context.fillText(entry, 60, 236 + index * 62));
  if (lines.length > 12) context.fillText("…", 60, 236 + 12 * 62);
  return canvas;
}
