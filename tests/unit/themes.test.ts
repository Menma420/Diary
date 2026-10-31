import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, themes } from "@/themes/themes";

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("approved theme tokens", () => {
  it("has four unique themes and Sakura as default", () => {
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(4);
    expect(DEFAULT_THEME).toBe("sakura-pink");
  });

  for (const theme of themes) {
    it(`${theme.name} supports readable text and visible controls`, () => {
      for (const surface of [theme.paper, theme.background]) {
        expect(contrast(theme.text, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.mutedText, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.focusRing, surface)).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(theme.accentStrong, theme.accentForeground)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
