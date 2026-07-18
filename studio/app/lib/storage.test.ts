import { describe, expect, it } from "vitest";
import { FACTORY_DOCUMENT } from "./default-keymap";
import { parseDocument, serializeDocument, validateDocument } from "./storage";

describe("keymap import and export", () => {
  it("round-trips a versioned document", () => {
    const imported = parseDocument(serializeDocument(FACTORY_DOCUMENT));
    expect(imported.schemaVersion).toBe(1);
    expect(imported.source).toBe("import");
    expect(imported.layers).toHaveLength(6);
  });

  it("preserves an uncommitted layer with a temporary negative ID", () => {
    const draft = structuredClone(FACTORY_DOCUMENT);
    draft.layers.push({ ...structuredClone(draft.layers[5]), id: -1, name: "Navigation" });
    draft.availableLayers = 3;

    const imported = parseDocument(serializeDocument(draft));
    expect(imported.layers.at(-1)).toMatchObject({ id: -1, name: "Navigation" });
    expect(imported.availableLayers).toBe(3);
  });

  it("rejects malformed documents", () => {
    expect(validateDocument({ schemaVersion: 1, layers: [] })).toBe(false);
    expect(() => parseDocument('{"schemaVersion":1}')).toThrow(/形式/);

    const malformedBehavior = structuredClone(FACTORY_DOCUMENT) as unknown as { behaviors: unknown[] };
    malformedBehavior.behaviors = [null];
    expect(validateDocument(malformedBehavior)).toBe(false);

    const malformedLayout = structuredClone(FACTORY_DOCUMENT);
    malformedLayout.layout.keys.pop();
    expect(validateDocument(malformedLayout)).toBe(false);
  });
});
