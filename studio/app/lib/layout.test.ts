import { describe, expect, it } from "vitest";
import { bindingIndexForDisplay, displayPositionForBinding, S_LAYOUT_KEYS, S_LOGICAL_POSITIONS } from "./layout";

describe("S layout position mapping", () => {
  it("contains the 44 physical XS keys", () => {
    expect(S_LAYOUT_KEYS).toHaveLength(44);
    expect(S_LOGICAL_POSITIONS).toHaveLength(44);
    expect(new Set(S_LOGICAL_POSITIONS).size).toBe(44);
  });

  it("maps 66-binding documents through position_map_s_1", () => {
    expect(bindingIndexForDisplay(66, 0)).toBe(13);
    expect(bindingIndexForDisplay(66, 9)).toBe(22);
    expect(bindingIndexForDisplay(66, 10)).toBe(25);
    expect(bindingIndexForDisplay(66, 43)).toBe(64);
    expect(displayPositionForBinding(66, 39)).toBe(20);
    expect(displayPositionForBinding(66, 12)).toBeNull();
  });

  it("uses direct positions for native 44-binding documents", () => {
    expect(bindingIndexForDisplay(44, 17)).toBe(17);
    expect(displayPositionForBinding(44, 17)).toBe(17);
  });
});
