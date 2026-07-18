import type { KeymapDocument, PhysicalKey } from "./types";

export const S_LOGICAL_POSITIONS = [
  13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  25, 26, 27, 28, 29, 32, 33, 34, 35, 36,
  39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
] as const;

const attrs = [
  [0, 60, 0, 0, 0], [100, 25, 0, 0, 0], [200, 0, 0, 0, 0], [300, 13, 0, 0, 0], [400, 25, 0, 0, 0],
  [950, 25, 0, 0, 0], [1050, 13, 0, 0, 0], [1150, 0, 0, 0, 0], [1250, 25, 0, 0, 0], [1350, 60, 0, 0, 0],
  [0, 160, 0, 0, 0], [100, 125, 0, 0, 0], [200, 100, 0, 0, 0], [300, 113, 0, 0, 0], [400, 125, 0, 0, 0],
  [950, 125, 0, 0, 0], [1050, 113, 0, 0, 0], [1150, 100, 0, 0, 0], [1250, 125, 0, 0, 0], [1350, 160, 0, 0, 0],
  [0, 260, 0, 0, 0], [100, 225, 0, 0, 0], [200, 200, 0, 0, 0], [300, 213, 0, 0, 0], [400, 225, 0, 0, 0], [500, 240, 0, 0, 0],
  [850, 240, 0, 0, 0], [950, 225, 0, 0, 0], [1050, 213, 0, 0, 0], [1150, 200, 0, 0, 0], [1250, 225, 0, 0, 0], [1350, 260, 0, 0, 0],
  [0, 360, 0, 0, 0], [100, 325, 0, 0, 0], [200, 300, 0, 0, 0], [315, 350, 0, 0, 0], [420, 350, 1000, 420, 450], [522, 371, 2000, 525, 470],
  [828, 371, -2000, 925, 470], [930, 350, -1000, 1030, 450], [1035, 350, 0, 0, 0], [1150, 300, 0, 0, 0], [1250, 325, 0, 0, 0], [1350, 360, 0, 0, 0],
] as const;

export const S_LAYOUT_KEYS: PhysicalKey[] = attrs.map(
  ([x, y, rotation, rotationX, rotationY], displayPosition) => ({
    displayPosition,
    x,
    y,
    width: 100,
    height: 100,
    rotation,
    rotationX,
    rotationY,
  }),
);

export function bindingIndexForDisplay(bindingCount: number, displayPosition: number) {
  if (displayPosition < 0 || displayPosition >= S_LAYOUT_KEYS.length) {
    throw new RangeError(`Unknown S-layout display position: ${displayPosition}`);
  }

  return bindingCount <= S_LAYOUT_KEYS.length
    ? displayPosition
    : S_LOGICAL_POSITIONS[displayPosition];
}
export function displayPositionForBinding(bindingCount: number, bindingIndex: number) {
  if (bindingCount <= S_LAYOUT_KEYS.length) {
    return bindingIndex >= 0 && bindingIndex < S_LAYOUT_KEYS.length
      ? bindingIndex
      : null;
  }

  const index = S_LOGICAL_POSITIONS.indexOf(
    bindingIndex as (typeof S_LOGICAL_POSITIONS)[number],
  );
  return index === -1 ? null : index;
}

export function isSLayoutDocument(document: KeymapDocument) {
  return document.layout.keys.length === 44 || /(^|\s)S(\s|$)/i.test(document.layout.name);
}
