import { describe, expect, it } from "vitest";
import { FACTORY_DOCUMENT, MOCK_BEHAVIOR_IDS } from "./default-keymap";
import { bindingsEqual, diffDocuments } from "./diff";

describe("keymap diff", () => {
  it("ignores display-only labels", () => {
    expect(bindingsEqual(
      { behaviorId: 1, param1: 2, param2: 3, label: "A" },
      { behaviorId: 1, param1: 2, param2: 3, label: "B" },
    )).toBe(true);
  });

  it("reports binding and layer-name changes", () => {
    const draft = structuredClone(FACTORY_DOCUMENT);
    draft.layers[0].name = "Main";
    draft.layers[0].bindings[13] = { behaviorId: 1, param1: 999, param2: 0 };
    const changes = diffDocuments(FACTORY_DOCUMENT, draft);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ type: "layerName", layerId: 0, before: "Base", after: "Main" });
    expect(changes[1]).toMatchObject({ type: "binding", keyPosition: 13, displayPosition: 0 });
  });

  it("reports a newly staged layer as one addition", () => {
    const draft = structuredClone(FACTORY_DOCUMENT);
    draft.layers.push({
      id: -1,
      name: "Navigation",
      bindings: Array.from({ length: 66 }, () => ({ behaviorId: MOCK_BEHAVIOR_IDS.trans, param1: 0, param2: 0 })),
    });
    draft.availableLayers = 3;

    expect(diffDocuments(FACTORY_DOCUMENT, draft)).toEqual([
      expect.objectContaining({
        type: "layerAdd",
        temporaryLayerId: -1,
        layerIndex: 6,
        after: expect.objectContaining({ name: "Navigation" }),
      }),
    ]);
  });
});
