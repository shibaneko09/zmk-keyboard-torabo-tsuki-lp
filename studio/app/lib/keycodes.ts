export const KEYCODE_CATEGORIES = [
  { id: "letters", label: "Letters" },
  { id: "numbers", label: "Numbers" },
  { id: "symbols", label: "Symbols" },
  { id: "modifiers", label: "Modifiers" },
  { id: "navigation", label: "Navigation" },
  { id: "function", label: "Function" },
  { id: "keypad", label: "Keypad" },
  { id: "special", label: "Special" },
  { id: "macos", label: "macOS" },
  { id: "ime", label: "IME" },
  { id: "media", label: "Media" },
  { id: "mouse", label: "Mouse" },
] as const;

export type KeycodeCategory = typeof KEYCODE_CATEGORIES[number]["id"];

export type Keycode = {
  name: string;
  label: string;
  value: number;
  category: KeycodeCategory;
};

export const KEYCODE_MODIFIERS = [
  { id: "ctrl", label: "Ctrl", mask: 0x01 << 24 },
  { id: "shift", label: "Shift", mask: 0x02 << 24 },
  { id: "alt", label: "Alt / Option", mask: 0x04 << 24 },
  { id: "gui", label: "Command / GUI", mask: 0x08 << 24 },
] as const;

const KEYCODE_MODIFIER_MASK = 0xff000000;

export function keycodeModifiers(value: number) {
  return (value >>> 0) & KEYCODE_MODIFIER_MASK;
}

export function withoutKeycodeModifiers(value: number) {
  return (value >>> 0) & ~KEYCODE_MODIFIER_MASK;
}

export function withKeycodeModifiers(value: number, modifiers: number) {
  return (withoutKeycodeModifiers(value) | (modifiers & KEYCODE_MODIFIER_MASK)) >>> 0;
}

export function keycodeSupportsModifiers(value: number) {
  return ((withoutKeycodeModifiers(value) >>> 16) & 0xff) === 0x07;
}

export const hidUsage = (page: number, id: number) => (page << 16) | id;

const keyboard = (name: string, label: string, id: number, category: Keycode["category"]): Keycode => ({
  name,
  label,
  value: hidUsage(0x07, id),
  category,
});

const modifiedKeyboard = (
  name: string,
  label: string,
  id: number,
  modifiers: number,
  category: Keycode["category"],
): Keycode => ({
  name,
  label,
  value: (modifiers << 24) | hidUsage(0x07, id),
  category,
});

const shiftedKeyboard = (name: string, label: string, id: number) =>
  modifiedKeyboard(name, label, id, 0x02, "symbols");

const consumer = (
  name: string,
  label: string,
  id: number,
  category: Keycode["category"] = "media",
): Keycode => ({
  name,
  label,
  value: hidUsage(0x0c, id),
  category,
});

export const KEYCODES: Keycode[] = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter, index) => keyboard(letter, letter, 0x04 + index, "letters")),
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((number, index) => keyboard(`NUMBER_${number}`, number, 0x1e + index, "numbers")),
  keyboard("MINUS", "-  _", 0x2d, "symbols"), keyboard("EQUAL", "=  +", 0x2e, "symbols"), keyboard("LEFT_BRACKET", "[  {", 0x2f, "symbols"),
  keyboard("RIGHT_BRACKET", "]  }", 0x30, "symbols"), keyboard("BACKSLASH", "\\  |", 0x31, "symbols"), keyboard("NON_US_HASH", "Non-US #", 0x32, "symbols"),
  keyboard("SEMICOLON", ";  :", 0x33, "symbols"), keyboard("SINGLE_QUOTE", "'  \"", 0x34, "symbols"), keyboard("GRAVE", "`  ~", 0x35, "symbols"),
  keyboard("COMMA", ",  <", 0x36, "symbols"), keyboard("DOT", ".  >", 0x37, "symbols"), keyboard("FSLH", "/  ?", 0x38, "symbols"),
  shiftedKeyboard("EXCLAMATION", "!", 0x1e), shiftedKeyboard("AT_SIGN", "@", 0x1f), shiftedKeyboard("HASH", "#", 0x20),
  shiftedKeyboard("DOLLAR", "$", 0x21), shiftedKeyboard("PERCENT", "%", 0x22), shiftedKeyboard("CARET", "^", 0x23),
  shiftedKeyboard("AMPERSAND", "&", 0x24), shiftedKeyboard("ASTERISK", "*", 0x25), shiftedKeyboard("LEFT_PARENTHESIS", "(", 0x26),
  shiftedKeyboard("RIGHT_PARENTHESIS", ")", 0x27), shiftedKeyboard("UNDERSCORE", "_", 0x2d), shiftedKeyboard("PLUS", "+", 0x2e),
  shiftedKeyboard("LEFT_BRACE", "{", 0x2f), shiftedKeyboard("RIGHT_BRACE", "}", 0x30), shiftedKeyboard("PIPE", "|", 0x31),
  shiftedKeyboard("COLON", ":", 0x33), shiftedKeyboard("DOUBLE_QUOTES", "\"", 0x34), shiftedKeyboard("TILDE", "~", 0x35),
  shiftedKeyboard("LESS_THAN", "<", 0x36), shiftedKeyboard("GREATER_THAN", ">", 0x37), shiftedKeyboard("QUESTION", "?", 0x38),
  keyboard("ENTER", "Return ↩", 0x28, "special"), keyboard("ESC", "Escape ⎋", 0x29, "special"),
  keyboard("BACKSPACE", "Delete ⌫", 0x2a, "special"), keyboard("TAB", "Tab ⇥", 0x2b, "special"), keyboard("SPACE", "Space", 0x2c, "special"),
  keyboard("CAPSLOCK", "Caps Lock ⇪", 0x39, "special"), keyboard("PRINTSCREEN", "Print Screen", 0x46, "special"),
  keyboard("SCROLLLOCK", "Scroll Lock", 0x47, "special"), keyboard("PAUSE_BREAK", "Pause / Break", 0x48, "special"),
  keyboard("INSERT", "Insert", 0x49, "navigation"), keyboard("HOME", "Home ↖", 0x4a, "navigation"), keyboard("PAGE_UP", "Page Up ⇞", 0x4b, "navigation"),
  keyboard("DELETE", "Forward Delete ⌦", 0x4c, "navigation"), keyboard("END", "End ↘", 0x4d, "navigation"), keyboard("PAGE_DOWN", "Page Down ⇟", 0x4e, "navigation"),
  keyboard("RIGHT", "→", 0x4f, "navigation"), keyboard("LEFT", "←", 0x50, "navigation"), keyboard("DOWN", "↓", 0x51, "navigation"), keyboard("UP", "↑", 0x52, "navigation"),
  ...Array.from({ length: 12 }, (_, index) => keyboard(`F${index + 1}`, `F${index + 1}`, 0x3a + index, "function")),
  ...Array.from({ length: 12 }, (_, index) => keyboard(`F${index + 13}`, `F${index + 13}`, 0x68 + index, "function")),
  keyboard("KP_NUMLOCK", "Clear / Num Lock", 0x53, "keypad"), keyboard("KP_DIVIDE", "Keypad /", 0x54, "keypad"),
  keyboard("KP_MULTIPLY", "Keypad *", 0x55, "keypad"), keyboard("KP_MINUS", "Keypad -", 0x56, "keypad"),
  keyboard("KP_PLUS", "Keypad +", 0x57, "keypad"), keyboard("KP_ENTER", "Keypad Enter", 0x58, "keypad"),
  ...Array.from({ length: 9 }, (_, index) => keyboard(`KP_NUMBER_${index + 1}`, `Keypad ${index + 1}`, 0x59 + index, "keypad")),
  keyboard("KP_NUMBER_0", "Keypad 0", 0x62, "keypad"), keyboard("KP_DOT", "Keypad .", 0x63, "keypad"),
  keyboard("KP_EQUAL", "Keypad =", 0x67, "keypad"),
  keyboard("K_APPLICATION", "Application / Menu", 0x65, "special"), keyboard("K_POWER", "Power", 0x66, "special"),
  keyboard("K_HELP", "Help", 0x75, "special"), keyboard("K_MENU", "Menu", 0x76, "special"), keyboard("K_SELECT", "Select", 0x77, "special"),
  keyboard("LCTRL", "⌃ Left Control", 0xe0, "modifiers"), keyboard("LSHIFT", "⇧ Left Shift", 0xe1, "modifiers"), keyboard("LALT", "⌥ Left Option", 0xe2, "modifiers"), keyboard("LGUI", "⌘ Left Command", 0xe3, "modifiers"),
  keyboard("RCTRL", "⌃ Right Control", 0xe4, "modifiers"), keyboard("RSHIFT", "⇧ Right Shift", 0xe5, "modifiers"), keyboard("RALT", "⌥ Right Option", 0xe6, "modifiers"), keyboard("RGUI", "⌘ Right Command", 0xe7, "modifiers"),
  consumer("C_BRIGHTNESS_DEC", "Brightness −", 0x70, "macos"), consumer("C_BRIGHTNESS_INC", "Brightness +", 0x6f, "macos"),
  consumer("C_AC_DESKTOP_SHOW_ALL_WINDOWS", "Mission Control", 0x29f, "macos"), consumer("C_AC_DESKTOP_SHOW_ALL_APPLICATIONS", "Launchpad", 0x2a2, "macos"),
  consumer("C_AC_SEARCH", "Spotlight Search", 0x221, "macos"), consumer("GLOBE", "Globe / Fn", 0x29d, "macos"),
  consumer("C_VOICE_COMMAND", "Voice Command", 0xcf, "macos"), consumer("C_EJECT", "Eject ⏏", 0xb8, "macos"),
  keyboard("INT_YEN", "¥", 0x89, "ime"), keyboard("LANG1", "LANG1", 0x90, "ime"), keyboard("LANG2", "LANG2", 0x91, "ime"), keyboard("LANG5", "LANG5", 0x94, "ime"),
  consumer("C_PREVIOUS", "Previous Track", 0xb6), consumer("C_REWIND", "Rewind", 0xb4), consumer("C_PLAY", "Play", 0xb0),
  consumer("C_PAUSE", "Pause", 0xb1), consumer("C_PLAY_PAUSE", "Play / Pause", 0xcd), consumer("C_STOP", "Stop", 0xb7),
  consumer("C_FAST_FORWARD", "Fast Forward", 0xb3), consumer("C_NEXT", "Next Track", 0xb5), consumer("C_MUTE", "Mute", 0xe2),
  consumer("C_VOLUME_DOWN", "Volume −", 0xea), consumer("C_VOLUME_UP", "Volume +", 0xe9),
  { name: "MB1", label: "Mouse 1", value: hidUsage(0x09, 1), category: "mouse" },
  { name: "MB2", label: "Mouse 2", value: hidUsage(0x09, 2), category: "mouse" },
  { name: "MB3", label: "Mouse 3", value: hidUsage(0x09, 3), category: "mouse" },
  { name: "MB4", label: "Mouse 4 / Back", value: hidUsage(0x09, 4), category: "mouse" },
  { name: "MB5", label: "Mouse 5 / Forward", value: hidUsage(0x09, 5), category: "mouse" },
];

const byName = new Map(KEYCODES.map((keycode) => [keycode.name, keycode]));
const byValue = new Map(KEYCODES.map((keycode) => [keycode.value, keycode]));

export function keycodeByName(name: string) {
  return byName.get(name);
}

export function keycodeLabel(value: number) {
  const normalizedValue = value >>> 0;
  const exact = byValue.get(normalizedValue);
  if (exact) return exact.label;

  const base = byValue.get(withoutKeycodeModifiers(normalizedValue));
  const modifiers = KEYCODE_MODIFIERS
    .filter((modifier) => (keycodeModifiers(normalizedValue) & modifier.mask) !== 0)
    .map((modifier) => modifier.label.split(" / ")[0]);
  if (base && modifiers.length) return `${modifiers.join(" + ")} + ${base.label}`;

  return `0x${normalizedValue.toString(16).toUpperCase()}`;
}

export function keycodeCategory(value: number) {
  const normalizedValue = value >>> 0;
  return byValue.get(normalizedValue)?.category ?? byValue.get(withoutKeycodeModifiers(normalizedValue))?.category;
}

export function filterKeycodes(query: string, category?: KeycodeCategory) {
  const normalized = query.trim().toLowerCase();
  return KEYCODES.filter((keycode) =>
    (!category || keycode.category === category) &&
    (!normalized || `${keycode.name} ${keycode.label} ${keycode.category}`.toLowerCase().includes(normalized)),
  );
}
