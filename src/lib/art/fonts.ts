import { GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";

/** Families registered with Skia for the card and pass images. The TTFs come from @expo-google-fonts (all OFL). */
export const FONT = { blackletter: "AbsolvoMaguntia", heavy: "AbsolvoCook", body: "AbsolvoFell", italic: "AbsolvoFellItalic", caps: "AbsolvoFellSC" } as const;

const FILES: [string, string][] = [
  [FONT.blackletter, "unifrakturmaguntia/400Regular/UnifrakturMaguntia_400Regular.ttf"],
  [FONT.heavy, "unifrakturcook/700Bold/UnifrakturCook_700Bold.ttf"],
  [FONT.body, "im-fell-english/400Regular/IMFellEnglish_400Regular.ttf"],
  [FONT.italic, "im-fell-english/400Regular_Italic/IMFellEnglish_400Regular_Italic.ttf"],
  [FONT.caps, "im-fell-english-sc/400Regular/IMFellEnglishSC_400Regular.ttf"]
];

let registered = false;
export function registerFonts() {
  if (registered) return;
  const root = path.join(process.cwd(), "node_modules", "@expo-google-fonts");
  for (const [family, file] of FILES) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) throw new Error(`Missing font ${file}; run npm install.`);
    GlobalFonts.registerFromPath(target, family);
  }
  registered = true;
}
