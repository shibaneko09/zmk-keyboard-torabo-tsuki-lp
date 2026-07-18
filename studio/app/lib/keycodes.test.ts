import { describe, expect, it } from "vitest";
import {
  filterKeycodes,
  hidUsage,
  KEYCODE_CATEGORIES,
  KEYCODE_MODIFIERS,
  KEYCODES,
  keycodeByName,
  keycodeCategory,
  keycodeLabel,
  keycodeModifiers,
  keycodeSupportsModifiers,
  withKeycodeModifiers,
  withoutKeycodeModifiers,
} from "./keycodes";

describe("keycode categories", () => {
  it("offers the supported categories in the editor order", () => {
    expect(KEYCODE_CATEGORIES.map((category) => category.label)).toEqual([
      "Letters", "Numbers", "Symbols", "Modifiers", "Navigation", "Function",
      "Keypad", "Special", "macOS", "IME", "Media", "Mouse",
    ]);
  });

  it("separates function, navigation, and special keys", () => {
    expect(keycodeByName("F1")?.category).toBe("function");
    expect(keycodeByName("UP")?.category).toBe("navigation");
    expect(keycodeByName("ENTER")?.category).toBe("special");
    expect(keycodeByName("CAPSLOCK")?.value).toBe(hidUsage(0x07, 0x39));
    expect(keycodeByName("KP_ENTER")?.category).toBe("keypad");
    expect(keycodeByName("F24")?.category).toBe("function");
  });

  it("filters search results within the selected category", () => {
    expect(filterKeycodes("", "letters")).toHaveLength(26);
    expect(filterKeycodes("shift", "modifiers").map((keycode) => keycode.name)).toEqual(["LSHIFT", "RSHIFT"]);
    expect(filterKeycodes("command", "modifiers").map((keycode) => keycode.name)).toEqual(["LGUI", "RGUI"]);
    expect(filterKeycodes("mission", "macos").map((keycode) => keycode.name)).toEqual(["C_AC_DESKTOP_SHOW_ALL_WINDOWS"]);
    expect(filterKeycodes("F1", "letters")).toEqual([]);
  });

  it("finds the category for the currently assigned keycode", () => {
    const mute = keycodeByName("C_MUTE");
    expect(mute && keycodeCategory(mute.value)).toBe("media");
  });

  it("encodes US shifted symbols with the ZMK left-shift modifier", () => {
    expect(keycodeByName("EXCLAMATION")?.value).toBe((0x02 << 24) | hidUsage(0x07, 0x1e));
    expect(keycodeByName("QUESTION")?.value).toBe((0x02 << 24) | hidUsage(0x07, 0x38));
  });

  it("combines modifiers with any keyboard keycode", () => {
    const semicolon = keycodeByName("SEMICOLON")?.value ?? 0;
    const shift = KEYCODE_MODIFIERS.find((modifier) => modifier.id === "shift")?.mask ?? 0;
    const ctrl = KEYCODE_MODIFIERS.find((modifier) => modifier.id === "ctrl")?.mask ?? 0;
    const modified = withKeycodeModifiers(semicolon, shift | ctrl);

    expect(keycodeModifiers(modified)).toBe(shift | ctrl);
    expect(withoutKeycodeModifiers(modified)).toBe(semicolon);
    expect(keycodeLabel(modified)).toBe("Ctrl + Shift + ;  :");
    expect(keycodeCategory(modified)).toBe("symbols");
  });

  it("can remove shift from a shifted symbol", () => {
    const colon = keycodeByName("COLON")?.value ?? 0;
    expect(keycodeLabel(withKeycodeModifiers(colon, 0))).toBe(";  :");
  });

  it("only applies key modifiers to keyboard-page usages", () => {
    expect(keycodeSupportsModifiers(keycodeByName("A")?.value ?? 0)).toBe(true);
    expect(keycodeSupportsModifiers(keycodeByName("C_MUTE")?.value ?? 0)).toBe(false);
  });

  it("does not expose duplicate HID values", () => {
    expect(new Set(KEYCODES.map((keycode) => keycode.value)).size).toBe(KEYCODES.length);
  });
});
