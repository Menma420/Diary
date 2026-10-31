import { z } from "zod";
import tokens from "./tokens.json";

const color = z.string().regex(/^#[0-9A-F]{6}$/);
const themeSchema = z.object({
  id: z.enum(["sakura-pink", "dreamy-sky", "lavender-dreams", "vintage-journal"]),
  name: z.string().min(1),
  decorationCollectionId: z.string().min(1),
  background: color, paper: color, paperBorder: color, line: color,
  text: color, mutedText: color, accent: color, accentSecondary: color,
  accentStrong: color, accentForeground: color, focusRing: color,
  shadow: z.string().min(1),
}).strict();

export const themes = z.array(themeSchema).length(4).parse(tokens);
export type Theme = z.infer<typeof themeSchema>;
export type ThemeId = Theme["id"];
export const DEFAULT_THEME: ThemeId = "sakura-pink";
