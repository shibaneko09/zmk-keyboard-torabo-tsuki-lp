import { describe, expect, it } from "vitest";
import { FACTORY_DOCUMENT } from "./default-keymap";
import { pushHistory, redoHistory, undoHistory } from "./history";

describe("editor history", () => {
  it("undoes and redoes a document change", () => {
    const initial = structuredClone(FACTORY_DOCUMENT);
    const renamed = structuredClone(initial);
    renamed.layers[0].name = "Main";

    const changed = pushHistory({ past: [], present: initial, future: [] }, renamed);
    const undone = undoHistory(changed);
    expect(undone.present.layers[0].name).toBe("Base");

    const redone = redoHistory(undone);
    expect(redone.present.layers[0].name).toBe("Main");
  });

  it("clears redo entries when a new edit is pushed", () => {
    const initial = structuredClone(FACTORY_DOCUMENT);
    const history = { past: [], present: initial, future: [structuredClone(initial)] };
    expect(pushHistory(history, structuredClone(initial)).future).toEqual([]);
  });
});
