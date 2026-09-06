import type { BehaviorDefinition, Binding } from "./types";

export const BLUETOOTH_COMMANDS = {
  clearSelected: 0,
  next: 1,
  previous: 2,
  select: 3,
  clearAll: 4,
  disconnect: 5,
} as const;

export type BluetoothPreset = {
  group: "接続先を選択" | "順番に切り替え" | "接続を管理";
  label: string;
  param1: number;
  param2: number;
};

const DEFAULT_PROFILE_COUNT = 5;
const MAX_PROFILE_COUNT = 16;

export function isBluetoothBehavior(behavior: BehaviorDefinition | undefined) {
  if (!behavior) return false;

  const normalizedName = behavior.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalizedName.includes("bluetooth")) return true;

  const noArgumentCommands = behavior.parameterSets.some((set) => {
    const values = new Set(set.param1
      .filter((description) => description.kind === "constant")
      .map((description) => description.value));
    return values.has(BLUETOOTH_COMMANDS.next) && values.has(BLUETOOTH_COMMANDS.previous);
  });
  const profileCommands = behavior.parameterSets.some((set) => {
    const values = new Set(set.param1
      .filter((description) => description.kind === "constant")
      .map((description) => description.value));
    return values.has(BLUETOOTH_COMMANDS.select)
      && values.has(BLUETOOTH_COMMANDS.disconnect)
      && set.param2.some((description) => description.kind === "range");
  });

  return noArgumentCommands && profileCommands;
}

function bluetoothProfileIndexes(behavior: BehaviorDefinition) {
  const indexedSet = behavior.parameterSets.find((set) =>
    set.param1.some((description) => description.kind === "constant" && description.value === BLUETOOTH_COMMANDS.select)
    && set.param2.some((description) => description.kind === "range"),
  );
  const range = indexedSet?.param2.find((description) => description.kind === "range");
  const min = range?.min ?? 0;
  // ZMK's metadata exposes ZMK_BLE_PROFILE_COUNT as the exclusive upper bound.
  const max = range?.max ?? min + DEFAULT_PROFILE_COUNT;
  const count = Math.min(MAX_PROFILE_COUNT, Math.max(0, max - min));
  return Array.from({ length: count || DEFAULT_PROFILE_COUNT }, (_, index) => min + index);
}

export function bluetoothPresets(behavior: BehaviorDefinition): BluetoothPreset[] {
  const profiles = bluetoothProfileIndexes(behavior);
  return [
    ...profiles.map((profile) => ({
      group: "接続先を選択" as const,
      label: `Bluetooth ${profile + 1}`,
      param1: BLUETOOTH_COMMANDS.select,
      param2: profile,
    })),
    { group: "順番に切り替え", label: "次のBluetooth", param1: BLUETOOTH_COMMANDS.next, param2: 0 },
    { group: "順番に切り替え", label: "前のBluetooth", param1: BLUETOOTH_COMMANDS.previous, param2: 0 },
    { group: "接続を管理", label: "選択中のペアリングを消去", param1: BLUETOOTH_COMMANDS.clearSelected, param2: 0 },
    { group: "接続を管理", label: "すべてのペアリングを消去", param1: BLUETOOTH_COMMANDS.clearAll, param2: 0 },
    ...profiles.map((profile) => ({
      group: "接続を管理" as const,
      label: `Bluetooth ${profile + 1}を切断`,
      param1: BLUETOOTH_COMMANDS.disconnect,
      param2: profile,
    })),
  ];
}

export function bluetoothPresetValue(param1: number, param2: number) {
  return `${param1}:${param2}`;
}

export function parseBluetoothPresetValue(value: string) {
  const [param1, param2] = value.split(":").map(Number);
  return Number.isInteger(param1) && Number.isInteger(param2) ? { param1, param2 } : null;
}

export function defaultBluetoothBinding(behavior: BehaviorDefinition): Binding {
  const preset = bluetoothPresets(behavior)[0];
  return { behaviorId: behavior.id, param1: preset.param1, param2: preset.param2 };
}
