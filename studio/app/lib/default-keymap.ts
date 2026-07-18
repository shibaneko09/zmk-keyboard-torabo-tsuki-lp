import { keycodeByName } from "./keycodes";
import { S_LAYOUT_KEYS, S_LOGICAL_POSITIONS } from "./layout";
import type { BehaviorDefinition, Binding, KeymapDocument, ParameterValueDescription } from "./types";

export const MOCK_BEHAVIOR_IDS = {
  kp: 1,
  mt: 2,
  lt: 3,
  mo: 4,
  tog: 5,
  to: 6,
  trans: 7,
  none: 8,
  kt: 9,
  mkp: 10,
  bt: 11,
} as const;

const hidParameter: ParameterValueDescription = { name: "Key code", kind: "hidUsage", keyboardMax: 0xff, consumerMax: 0x3ff };
const layerParameter: ParameterValueDescription = { name: "Layer", kind: "layerId" };
const modifierParameters: ParameterValueDescription[] = [
  ["L Ctrl", 1], ["L Shift", 2], ["L Alt", 4], ["L GUI", 8], ["R Ctrl", 16], ["R Shift", 32], ["R Alt", 64], ["R GUI", 128],
].map(([name, value]) => ({ name: String(name), kind: "constant" as const, value: Number(value) }));

export const MOCK_BEHAVIORS: BehaviorDefinition[] = [
  { id: MOCK_BEHAVIOR_IDS.kp, name: "Key Press", parameterSets: [{ param1: [hidParameter], param2: [] }] },
  { id: MOCK_BEHAVIOR_IDS.mt, name: "Mod-Tap", parameterSets: [{ param1: modifierParameters, param2: [hidParameter] }] },
  { id: MOCK_BEHAVIOR_IDS.lt, name: "Layer-Tap", parameterSets: [{ param1: [layerParameter], param2: [hidParameter] }] },
  { id: MOCK_BEHAVIOR_IDS.mo, name: "Momentary Layer", parameterSets: [{ param1: [layerParameter], param2: [] }] },
  { id: MOCK_BEHAVIOR_IDS.tog, name: "Toggle Layer", parameterSets: [{ param1: [layerParameter], param2: [] }] },
  { id: MOCK_BEHAVIOR_IDS.to, name: "To Layer", parameterSets: [{ param1: [layerParameter], param2: [] }] },
  { id: MOCK_BEHAVIOR_IDS.trans, name: "Transparent", parameterSets: [{ param1: [], param2: [] }] },
  { id: MOCK_BEHAVIOR_IDS.none, name: "None", parameterSets: [{ param1: [], param2: [] }] },
  { id: MOCK_BEHAVIOR_IDS.kt, name: "Key Toggle", parameterSets: [{ param1: [hidParameter], param2: [] }] },
  { id: MOCK_BEHAVIOR_IDS.mkp, name: "Mouse Key Press", parameterSets: [{ param1: [hidParameter], param2: [] }] },
  { id: MOCK_BEHAVIOR_IDS.bt, name: "Bluetooth", parameterSets: [{ param1: [{ name: "Command", kind: "range", min: 0, max: 255 }], param2: [{ name: "Profile", kind: "range", min: 0, max: 5 }] }] },
];

const binding = (behaviorId: number, param1 = 0, param2 = 0, label?: string): Binding => ({ behaviorId, param1, param2, ...(label ? { label } : {}) });
const trans = () => binding(MOCK_BEHAVIOR_IDS.trans, 0, 0, "▽");
const kp = (name: string, label?: string) => binding(MOCK_BEHAVIOR_IDS.kp, keycodeByName(name)?.value ?? 0, 0, label);
const mt = (modifier: number, name: string, label?: string) => binding(MOCK_BEHAVIOR_IDS.mt, modifier, keycodeByName(name)?.value ?? 0, label);
const lt = (layer: number, name: string, label?: string) => binding(MOCK_BEHAVIOR_IDS.lt, layer, keycodeByName(name)?.value ?? 0, label);
const kt = (name: string, label?: string) => binding(MOCK_BEHAVIOR_IDS.kt, keycodeByName(name)?.value ?? 0, 0, label);
const mkp = (name: string, label?: string) => binding(MOCK_BEHAVIOR_IDS.mkp, keycodeByName(name)?.value ?? 0, 0, label);

function layerFromVisible(id: number, name: string, visible: Binding[]): KeymapDocument["layers"][number] {
  const bindings = Array.from({ length: 66 }, trans);
  visible.forEach((item, displayPosition) => {
    bindings[S_LOGICAL_POSITIONS[displayPosition]] = item;
  });
  return { id, name, bindings };
}

const base = [
  ...["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((key) => kp(key)),
  ...["A", "S", "D", "F", "G", "H", "J", "K", "L", "MINUS"].map((key) => kp(key)),
  mt(2, "Z", "Shift / Z"), kp("X"), kp("C"), kp("V"), kp("B"), lt(5, "C_MUTE", "L5 / Mute"), kp("ESC"), kp("N"), kp("M"), kp("COMMA"), kp("DOT"), mt(32, "FSLH", "Shift / /"),
  kp("LCTRL"), kp("LGUI"), kt("LALT", "Toggle Alt"), lt(2, "TAB", "L2 / Tab"), lt(1, "LANG5", "L1 / LANG5"), kp("SPACE"), lt(3, "ENTER", "L3 / Enter"), kp("BACKSPACE"), trans(), trans(), kp("RGUI"), kp("RCTRL"),
];

const symbol = Array.from({ length: 44 }, trans);
[[5, "EXCLAMATION", "!"], [6, "LEFT_BRACKET", "["], [7, "CARET", "^"], [8, "AT_SIGN", "@"], [9, "AMPERSAND", "&"], [19, "LEFT_PARENTHESIS", "("], [25, "RIGHT_BRACKET", "]"], [31, "SEMICOLON", ";"]].forEach(([position, key, label]) => {
  symbol[Number(position)] = kp(String(key), String(label));
});

const number = Array.from({ length: 44 }, trans);
["1", "2", "3", "4", "5"].forEach((value, index) => { number[5 + index] = kp(`NUMBER_${value}`); });
["6", "7", "8", "9", "0"].forEach((value, index) => { number[15 + index] = kp(`NUMBER_${value}`); });
number[26] = kp("FSLH"); number[27] = kp("ASTERISK", "*"); number[28] = kp("EQUAL"); number[29] = kp("PLUS", "+"); number[30] = kp("MINUS");

const move = Array.from({ length: 44 }, trans);
move[16] = kp("UP"); move[26] = kp("LEFT"); move[27] = kp("DOWN"); move[28] = kp("RIGHT"); move[32] = kp("LCTRL"); move[38] = kp("PRINTSCREEN");

const mouse = Array.from({ length: 44 }, trans);
mouse[16] = mkp("MB1", "Mouse 1"); mouse[17] = mkp("MB2", "Mouse 2"); mouse[18] = mkp("MB3", "Mouse 3");

const scroll = Array.from({ length: 44 }, trans);

export const FACTORY_DOCUMENT: KeymapDocument = {
  schemaVersion: 1,
  source: "factory",
  device: { name: "torabo-tsuki LP XS", serialNumber: "preview" },
  layout: { name: "S Layout", keys: S_LAYOUT_KEYS, bindingCount: 66 },
  behaviors: MOCK_BEHAVIORS,
  availableLayers: 4,
  maxLayerNameLength: 20,
  layers: [
    layerFromVisible(0, "Base", base),
    layerFromVisible(1, "Symbol", symbol),
    layerFromVisible(2, "Number", number),
    layerFromVisible(3, "Move", move),
    layerFromVisible(4, "Mouse", mouse),
    layerFromVisible(5, "Scroll", scroll),
  ],
};
