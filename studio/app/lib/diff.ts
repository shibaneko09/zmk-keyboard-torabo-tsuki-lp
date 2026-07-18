import { displayPositionForBinding } from "./layout";
import type { BehaviorDefinition, Binding, KeymapChange, KeymapDocument } from "./types";
import { keycodeLabel } from "./keycodes";

export function bindingsEqual(left: Binding, right: Binding) {
  return left.behaviorId === right.behaviorId && left.param1 === right.param1 && left.param2 === right.param2;
}

export function diffDocuments(baseline: KeymapDocument, draft: KeymapDocument): KeymapChange[] {
  const changes: KeymapChange[] = [];
  const baselineLayers = new Map(baseline.layers.map((layer) => [layer.id, layer]));

  for (const [layerIndex, layer] of draft.layers.entries()) {
    const beforeLayer = baselineLayers.get(layer.id);
    if (!beforeLayer) {
      changes.push({
        type: "layerAdd",
        temporaryLayerId: layer.id,
        layerIndex,
        after: layer,
      });
      continue;
    }

    if (beforeLayer.name !== layer.name) {
      changes.push({ type: "layerName", layerId: layer.id, before: beforeLayer.name, after: layer.name });
    }

    const count = Math.min(beforeLayer.bindings.length, layer.bindings.length);
    for (let keyPosition = 0; keyPosition < count; keyPosition += 1) {
      const before = beforeLayer.bindings[keyPosition];
      const after = layer.bindings[keyPosition];
      if (!bindingsEqual(before, after)) {
        changes.push({
          type: "binding",
          layerId: layer.id,
          layerName: layer.name,
          keyPosition,
          displayPosition: displayPositionForBinding(layer.bindings.length, keyPosition),
          before,
          after,
        });
      }
    }
  }

  return changes;
}

export function behaviorForBinding(document: KeymapDocument, binding: Binding) {
  return document.behaviors.find((behavior) => behavior.id === binding.behaviorId);
}

function normalizedBehaviorName(behavior?: BehaviorDefinition) {
  return behavior?.name.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

export function describeBinding(document: KeymapDocument, binding: Binding) {
  if (binding.label) return binding.label;
  const behavior = behaviorForBinding(document, binding);
  const name = normalizedBehaviorName(behavior);

  if (name.includes("transparent")) return "▽";
  if (name === "none") return "—";
  if (name.includes("layertap")) return `L${binding.param1} / ${keycodeLabel(binding.param2)}`;
  if (name.includes("modtap")) return `MT / ${keycodeLabel(binding.param2)}`;
  if (name.includes("momentary")) return `MO(${binding.param1})`;
  if (name.includes("togglelayer")) return `TG(${binding.param1})`;
  if (name.includes("tolayer")) return `TO(${binding.param1})`;
  if (name.includes("keypress") || name.includes("keytoggle") || name.includes("mouse")) return keycodeLabel(binding.param1 || binding.param2);
  return behavior ? `${behavior.name} ${binding.param1 || ""}`.trim() : `Behavior ${binding.behaviorId}`;
}
