import { describe, expect, it } from "vitest";
import { MOCK_BEHAVIOR_IDS } from "./default-keymap";
import { diffDocuments } from "./diff";
import { keycodeByName } from "./keycodes";
import { MockZmkClient, selectEditorPhysicalLayout } from "./zmk-client";

describe("selectEditorPhysicalLayout", () => {
  const key = { width: 100, height: 100, x: 0, y: 0, r: 0, rx: 0, ry: 0 };

  it("uses the S layout even when the firmware active layout is L", () => {
    const layouts = [
      { name: "L Layout", keys: Array.from({ length: 66 }, () => key) },
      { name: "S Layout", keys: Array.from({ length: 44 }, () => key) },
    ];

    expect(selectEditorPhysicalLayout(layouts)?.name).toBe("S Layout");
  });

  it("rejects firmware without a 44-key layout", () => {
    expect(selectEditorPhysicalLayout([
      { name: "L Layout", keys: Array.from({ length: 66 }, () => key) },
    ])).toBeUndefined();
  });
});

describe("MockZmkClient", () => {
  it("writes a staged change and reloads it", async () => {
    const client = new MockZmkClient();
    const baseline = await client.connect();
    const draft = structuredClone(baseline);
    draft.layers[0].bindings[13] = { behaviorId: 1, param1: 1234, param2: 0 };
    const written = await client.writeChanges(diffDocuments(baseline, draft));
    expect(written.layers[0].bindings[13].param1).toBe(1234);
    expect((await client.reload()).layers[0].bindings[13].param1).toBe(1234);
  });

  it("preserves a shifted keycode when writing and reloading", async () => {
    const client = new MockZmkClient();
    const baseline = await client.connect();
    const draft = structuredClone(baseline);
    const colon = keycodeByName("COLON")?.value;
    expect(colon).toBeDefined();

    draft.layers[0].bindings[13] = {
      behaviorId: MOCK_BEHAVIOR_IDS.kp,
      param1: colon ?? 0,
      param2: 0,
    };
    await client.writeChanges(diffDocuments(baseline, draft));

    expect((await client.reload()).layers[0].bindings[13].param1).toBe(colon);
  });

  it("keeps the previous snapshot when a write fails", async () => {
    const client = new MockZmkClient(undefined, 0);
    const baseline = await client.connect();
    const draft = structuredClone(baseline);
    draft.layers[0].bindings[13] = { behaviorId: 1, param1: 9999, param2: 0 };
    await expect(client.writeChanges(diffDocuments(baseline, draft))).rejects.toThrow(/Mock write failure/);
    expect((await client.reload()).layers[0].bindings[13]).toEqual(baseline.layers[0].bindings[13]);
  });

  it("adds a staged layer and remaps references from its temporary ID", async () => {
    const client = new MockZmkClient();
    const baseline = await client.connect();
    const draft = structuredClone(baseline);
    draft.layers.push({
      id: -1,
      name: "Navigation",
      bindings: Array.from({ length: 66 }, () => ({ behaviorId: MOCK_BEHAVIOR_IDS.trans, param1: 0, param2: 0 })),
    });
    draft.availableLayers = 3;
    draft.layers[0].bindings[13] = { behaviorId: MOCK_BEHAVIOR_IDS.mo, param1: -1, param2: 0 };

    const written = await client.writeChanges(diffDocuments(baseline, draft));
    const added = written.layers.find((layer) => layer.name === "Navigation");

    expect(added?.id).toBe(6);
    expect(written.availableLayers).toBe(3);
    expect(written.layers[0].bindings[13]).toMatchObject({ behaviorId: MOCK_BEHAVIOR_IDS.mo, param1: added?.id });
  });

  it("rejects a layer addition when the firmware has no reserved slots", async () => {
    const seed = structuredClone((await new MockZmkClient().connect()));
    seed.availableLayers = 0;
    const client = new MockZmkClient(seed);
    const baseline = await client.connect();
    const draft = structuredClone(baseline);
    draft.layers.push({ ...structuredClone(draft.layers[5]), id: -1, name: "Too many" });

    await expect(client.writeChanges(diffDocuments(baseline, draft))).rejects.toThrow(/no available layers/);
  });

  it("loads and persists pointing settings", async () => {
    const client = new MockZmkClient();
    await client.connect();

    expect(await client.getPointingSettings()).toMatchObject({
      cursorScaleMilli: 1000,
      scrollScaleMilli: 333,
    });

    const saved = await client.savePointingSettings({
      cursorScaleMilli: 1500,
      scrollScaleMilli: 500,
      invertScrollX: false,
      invertScrollY: true,
    });
    expect(saved).toEqual(await client.getPointingSettings());
  });
});
