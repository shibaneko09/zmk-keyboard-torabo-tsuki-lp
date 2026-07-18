import type { KeymapDocument } from "./types";

export const DRAFT_STORAGE_KEY = "torabo-tsuki-xs-editor-draft-v1";

const parameterKinds = new Set(["nil", "constant", "range", "hidUsage", "layerId"]);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function hasValidBehaviors(behaviors: unknown[]) {
  return behaviors.every((value) => {
    if (!value || typeof value !== "object") return false;
    const behavior = value as KeymapDocument["behaviors"][number];
    return isNumber(behavior.id) && typeof behavior.name === "string" && Array.isArray(behavior.parameterSets) &&
      behavior.parameterSets.every((set) => set && Array.isArray(set.param1) && Array.isArray(set.param2) &&
        [...set.param1, ...set.param2].every((description) =>
          description && typeof description.name === "string" && parameterKinds.has(description.kind),
        ),
      );
  });
}

export function validateDocument(value: unknown): value is KeymapDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<KeymapDocument>;
  if (document.schemaVersion !== 1 || !document.device || !document.layout) return false;
  if (!Array.isArray(document.behaviors) || !Array.isArray(document.layers)) return false;
  if (typeof document.device.name !== "string" || typeof document.device.serialNumber !== "string") return false;
  if (document.availableLayers !== undefined && (!Number.isInteger(document.availableLayers) || document.availableLayers < 0)) return false;
  if (document.maxLayerNameLength !== undefined && (!Number.isInteger(document.maxLayerNameLength) || document.maxLayerNameLength < 1)) return false;
  if (typeof document.layout.name !== "string" || !isNumber(document.layout.bindingCount) || !Array.isArray(document.layout.keys)) return false;
  if (document.layout.keys.length !== 44 || !document.layout.keys.every((key, displayPosition) =>
    key?.displayPosition === displayPosition &&
    [key.x, key.y, key.width, key.height, key.rotation, key.rotationX, key.rotationY].every(isNumber),
  )) return false;
  if (!hasValidBehaviors(document.behaviors) || !document.layers.length) return false;

  const layerIds = new Set(document.layers.map((layer) => layer?.id));
  if (layerIds.size !== document.layers.length) return false;

  return document.layers.every((layer) =>
    Number.isInteger(layer?.id) &&
    typeof layer?.name === "string" &&
    Array.isArray(layer?.bindings) &&
    (layer.bindings.length === 44 || layer.bindings.length >= 65) &&
    layer.bindings.every((binding) =>
      Number.isInteger(binding?.behaviorId) &&
      Number.isInteger(binding?.param1) &&
      Number.isInteger(binding?.param2),
    ),
  );
}

export function parseDocument(json: string) {
  const value: unknown = JSON.parse(json);
  if (!validateDocument(value)) throw new Error("このファイルはtorabo-tsuki XS Editor形式ではありません。");
  return { ...value, source: "import" as const };
}

export function serializeDocument(document: KeymapDocument) {
  return JSON.stringify({ ...document, source: "import" }, null, 2);
}
