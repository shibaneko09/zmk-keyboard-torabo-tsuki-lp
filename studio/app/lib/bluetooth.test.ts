import { describe, expect, it } from "vitest";
import { MOCK_BEHAVIORS, MOCK_BEHAVIOR_IDS } from "./default-keymap";
import {
  BLUETOOTH_COMMANDS,
  bluetoothPresets,
  bluetoothPresetValue,
  defaultBluetoothBinding,
  isBluetoothBehavior,
  parseBluetoothPresetValue,
} from "./bluetooth";

const bluetooth = MOCK_BEHAVIORS.find((behavior) => behavior.id === MOCK_BEHAVIOR_IDS.bt)!;

describe("Bluetooth behavior presets", () => {
  it("offers all five ZMK profiles as human-readable one-based choices", () => {
    const directProfiles = bluetoothPresets(bluetooth).filter((preset) => preset.param1 === BLUETOOTH_COMMANDS.select);

    expect(directProfiles.map((preset) => preset.label)).toEqual([
      "Bluetooth 1", "Bluetooth 2", "Bluetooth 3", "Bluetooth 4", "Bluetooth 5",
    ]);
    expect(directProfiles.map((preset) => preset.param2)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps next, previous, clear, and per-profile disconnect actions", () => {
    const presets = bluetoothPresets(bluetooth);

    expect(presets).toEqual(expect.arrayContaining([
      expect.objectContaining({ param1: BLUETOOTH_COMMANDS.next, param2: 0 }),
      expect.objectContaining({ param1: BLUETOOTH_COMMANDS.previous, param2: 0 }),
      expect.objectContaining({ param1: BLUETOOTH_COMMANDS.clearSelected, param2: 0 }),
      expect.objectContaining({ param1: BLUETOOTH_COMMANDS.clearAll, param2: 0 }),
      expect.objectContaining({ param1: BLUETOOTH_COMMANDS.disconnect, param2: 4 }),
    ]));
  });

  it("defaults a newly selected Bluetooth behavior to Bluetooth 1", () => {
    expect(defaultBluetoothBinding(bluetooth)).toEqual({
      behaviorId: MOCK_BEHAVIOR_IDS.bt,
      param1: BLUETOOTH_COMMANDS.select,
      param2: 0,
    });
  });

  it("round-trips a preset value without losing either ZMK parameter", () => {
    const encoded = bluetoothPresetValue(BLUETOOTH_COMMANDS.select, 2);
    expect(parseBluetoothPresetValue(encoded)).toEqual({ param1: BLUETOOTH_COMMANDS.select, param2: 2 });
    expect(parseBluetoothPresetValue("invalid")).toBeNull();
  });

  it("recognizes the ZMK Bluetooth display name", () => {
    expect(isBluetoothBehavior(bluetooth)).toBe(true);
    expect(isBluetoothBehavior(MOCK_BEHAVIORS[0])).toBe(false);
  });

  it("recognizes Bluetooth from device metadata when the display name is missing", () => {
    expect(isBluetoothBehavior({ ...bluetooth, name: "Behavior 11" })).toBe(true);
  });

  it("does not mistake an unrelated command behavior for Bluetooth", () => {
    expect(isBluetoothBehavior({
      id: 99,
      name: "Commands",
      parameterSets: [{
        param1: [
          { name: "Next", kind: "constant", value: BLUETOOTH_COMMANDS.next },
          { name: "Previous", kind: "constant", value: BLUETOOTH_COMMANDS.previous },
        ],
        param2: [],
      }],
    })).toBe(false);
  });
});
