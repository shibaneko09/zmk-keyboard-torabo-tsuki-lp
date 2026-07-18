import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import type { PhysicalLayout } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { S_LAYOUT_KEYS, S_LOGICAL_POSITIONS } from "./layout";
import type {
  BehaviorDefinition,
  Binding,
  KeymapChange,
  KeymapDocument,
  ParameterValueDescription,
} from "./types";
import { FACTORY_DOCUMENT } from "./default-keymap";
import type { PointingSettings } from "./pointing-rpc-wire";
import {
  PointingRpcUnsupportedError,
  ToraboStudioRpcConnection,
} from "./studio-rpc";

const S_LOGICAL_MAX_POSITION = S_LOGICAL_POSITIONS[S_LOGICAL_POSITIONS.length - 1];

function remapBinding(binding: Binding, layerIds: Map<number, number>): Binding {
  return {
    ...binding,
    param1: layerIds.get(binding.param1) ?? binding.param1,
    param2: layerIds.get(binding.param2) ?? binding.param2,
    label: undefined,
  };
}

function bindingsMatch(left: Binding, right: Binding) {
  return left.behaviorId === right.behaviorId && left.param1 === right.param1 && left.param2 === right.param2;
}

export function selectEditorPhysicalLayout(layouts: PhysicalLayout[]) {
  return layouts.find((layout) =>
    layout.keys.length === S_LAYOUT_KEYS.length && /(^|\s)S(\s|$)/i.test(layout.name),
  ) ?? layouts.find((layout) => layout.keys.length === S_LAYOUT_KEYS.length);
}

export interface ZmkDeviceClient {
  connect(): Promise<KeymapDocument>;
  reload(): Promise<KeymapDocument>;
  writeChanges(changes: KeymapChange[]): Promise<KeymapDocument>;
  getPointingSettings(): Promise<PointingSettings | null>;
  savePointingSettings(settings: PointingSettings): Promise<PointingSettings>;
  disconnect(): Promise<void>;
}

export class MockZmkClient implements ZmkDeviceClient {
  private document: KeymapDocument;
  private connected = false;
  private pointingSettings: PointingSettings = {
    cursorScaleMilli: 1000,
    scrollScaleMilli: 333,
    invertScrollX: true,
    invertScrollY: false,
  };

  constructor(seed: KeymapDocument = FACTORY_DOCUMENT, private readonly failAtChange = -1) {
    this.document = structuredClone(seed);
  }

  async connect() {
    this.connected = true;
    this.document = {
      ...structuredClone(this.document),
      source: "device",
      device: { name: "torabo-tsuki LP XS (Mock)", serialNumber: "MOCK-0001", transportLabel: "mock" },
    };
    return structuredClone(this.document);
  }

  async reload() {
    this.requireMockConnection();
    return structuredClone(this.document);
  }

  async writeChanges(changes: KeymapChange[]) {
    this.requireMockConnection();
    const next = structuredClone(this.document);
    if (this.failAtChange >= 0 && this.failAtChange < changes.length) throw new Error("Mock write failure");

    const layerIds = new Map<number, number>();
    let nextLayerId = Math.max(-1, ...next.layers.map((layer) => layer.id)) + 1;

    for (const change of changes) {
      if (change.type !== "layerAdd") continue;
      if (change.temporaryLayerId >= 0) throw new Error("Mock additions require a temporary layer ID");
      if ((next.availableLayers ?? 0) <= 0) throw new Error("Mock device has no available layers");
      const layerId = nextLayerId;
      nextLayerId += 1;
      layerIds.set(change.temporaryLayerId, layerId);
      next.layers.splice(change.layerIndex, 0, { ...structuredClone(change.after), id: layerId });
      next.availableLayers = (next.availableLayers ?? 0) - 1;
    }

    for (const change of changes) {
      if (change.type === "layerAdd") {
        const layer = next.layers.find((candidate) => candidate.id === layerIds.get(change.temporaryLayerId));
        if (!layer) throw new Error(`Unknown mock layer ${change.temporaryLayerId}`);
        layer.bindings = change.after.bindings.map((binding) => remapBinding(binding, layerIds));
        continue;
      }
      const layer = next.layers.find((candidate) => candidate.id === change.layerId);
      if (!layer) throw new Error(`Unknown mock layer ${change.layerId}`);
      if (change.type === "layerName") layer.name = change.after;
      else layer.bindings[change.keyPosition] = remapBinding(change.after, layerIds);
    }
    this.document = next;
    return structuredClone(this.document);
  }

  async disconnect() {
    this.connected = false;
  }

  async getPointingSettings() {
    this.requireMockConnection();
    return structuredClone(this.pointingSettings);
  }

  async savePointingSettings(settings: PointingSettings) {
    this.requireMockConnection();
    this.pointingSettings = structuredClone(settings);
    return structuredClone(this.pointingSettings);
  }

  private requireMockConnection() {
    if (!this.connected) throw new Error("Mock device is not connected");
  }
}

function serialNumberToString(serialNumber: Uint8Array | undefined) {
  if (!serialNumber?.length) return "unknown";
  return Array.from(serialNumber, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function convertParameter(value: {
  name: string;
  nil?: object;
  constant?: number;
  range?: { min: number; max: number };
  hidUsage?: { keyboardMax: number; consumerMax: number };
  layerId?: object;
}): ParameterValueDescription {
  if (value.constant !== undefined) return { name: value.name, kind: "constant", value: value.constant };
  if (value.range) return { name: value.name, kind: "range", min: value.range.min, max: value.range.max };
  if (value.hidUsage) return { name: value.name, kind: "hidUsage", keyboardMax: value.hidUsage.keyboardMax, consumerMax: value.hidUsage.consumerMax };
  if (value.layerId) return { name: value.name, kind: "layerId" };
  return { name: value.name, kind: "nil" };
}

export class BrowserZmkClient implements ZmkDeviceClient {
  private transport?: RpcTransport;
  private connection?: ToraboStudioRpcConnection;

  async connect() {
    if (!("serial" in navigator)) {
      throw new Error("このブラウザはWeb Serialに対応していません。ChromeまたはEdgeを使用してください。");
    }

    const { connect } = await import("@zmkfirmware/zmk-studio-ts-client/transport/serial");

    try {
      this.transport = await connect();
      this.connection = new ToraboStudioRpcConnection(this.transport);
      return await this.reload();
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async reload(): Promise<KeymapDocument> {
    const connection = this.requireConnection();

    const [deviceResponse, layoutsResponse, keymapResponse, behaviorListResponse] = await Promise.all([
      connection.call({ core: { getDeviceInfo: true } }),
      connection.call({ keymap: { getPhysicalLayouts: true } }),
      connection.call({ keymap: { getKeymap: true } }),
      connection.call({ behaviors: { listAllBehaviors: true } }),
    ]);

    const device = deviceResponse.core?.getDeviceInfo;
    const physicalLayouts = layoutsResponse.keymap?.getPhysicalLayouts;
    const keymap = keymapResponse.keymap?.getKeymap;
    const behaviorIds = behaviorListResponse.behaviors?.listAllBehaviors?.behaviors ?? [];

    if (!device || !keymap) throw new Error("デバイスからキーマップ情報を取得できませんでした。");

    const behaviors: BehaviorDefinition[] = [];
    for (const behaviorId of behaviorIds) {
      const response = await connection.call({ behaviors: { getBehaviorDetails: { behaviorId } } });
      const details = response.behaviors?.getBehaviorDetails;
      if (!details) continue;
      behaviors.push({
        id: details.id,
        name: details.displayName || `Behavior ${details.id}`,
        parameterSets: details.metadata.map((set) => ({
          param1: set.param1.map(convertParameter),
          param2: set.param2.map(convertParameter),
        })),
      });
    }

    const editorLayout = selectEditorPhysicalLayout(physicalLayouts?.layouts ?? []);
    if (!editorLayout) {
      const available = physicalLayouts?.layouts
        .map((layout) => `${layout.name || "名称不明"} (${layout.keys.length}キー)`)
        .join("、");
      throw new Error(`XSエディタで使用できるSレイアウト（44キー）がありません。利用可能: ${available || "なし"}`);
    }

    const unsupportedLayer = keymap.layers.find((layer) =>
      layer.bindings.length !== S_LAYOUT_KEYS.length && layer.bindings.length <= S_LOGICAL_MAX_POSITION,
    );
    if (unsupportedLayer) {
      throw new Error(`Layer ${unsupportedLayer.id} は未対応のキーマップ長（${unsupportedLayer.bindings.length} bindings）です。44または65以上が必要です。`);
    }
    const bindingCount = keymap.layers[0]?.bindings.length ?? S_LAYOUT_KEYS.length;

    const keys = editorLayout.keys.map((key, displayPosition) => ({
      displayPosition,
      x: key.x,
      y: key.y,
      width: key.width,
      height: key.height,
      rotation: key.r,
      rotationX: key.rx,
      rotationY: key.ry,
    }));

    return {
      schemaVersion: 1,
      source: "device",
      device: {
        name: device.name || "ZMK device",
        serialNumber: serialNumberToString(device.serialNumber),
        transportLabel: this.transport?.label,
      },
      layout: {
        name: editorLayout.name || "S Layout",
        keys,
        bindingCount,
      },
      behaviors,
      availableLayers: keymap.availableLayers,
      maxLayerNameLength: keymap.maxLayerNameLength,
      layers: keymap.layers.map((layer) => ({
        id: layer.id,
        name: layer.name || `Layer ${layer.id}`,
        bindings: layer.bindings.map((binding) => ({
          behaviorId: binding.behaviorId,
          param1: binding.param1,
          param2: binding.param2,
        })),
      })),
    };
  }

  async writeChanges(changes: KeymapChange[]) {
    const connection = this.requireConnection();

    try {
      const additions = changes.filter((change) => change.type === "layerAdd");
      const layerIds = new Map<number, number>();
      const addedLayers = new Map<number, {
        index: number;
        layer: { id: number; name: string; bindings: Binding[] };
      }>();

      for (const addition of additions) {
        if (addition.temporaryLayerId >= 0) {
          throw new Error("追加レイヤーの一時IDが不正です。Import内容を確認してください。");
        }
        const response = await connection.call({ keymap: { addLayer: {} } });
        const added = response.keymap?.addLayer?.ok;
        if (!added?.layer) {
          const noSpace = response.keymap?.addLayer?.err === 2;
          throw new Error(noSpace ? "ファームウェアに空きレイヤーがありません。予約レイヤーを追加したファームウェアが必要です。" : "レイヤーを追加できませんでした。");
        }
        layerIds.set(addition.temporaryLayerId, added.layer.id);
        addedLayers.set(addition.temporaryLayerId, {
          index: added.index,
          layer: {
            id: added.layer.id,
            name: added.layer.name,
            bindings: added.layer.bindings.map((binding) => ({ ...binding })),
          },
        });
      }

      for (const addition of additions) {
        const added = addedLayers.get(addition.temporaryLayerId);
        const layerId = layerIds.get(addition.temporaryLayerId);
        if (!added?.layer || layerId === undefined) throw new Error("追加したレイヤー情報を取得できませんでした。");

        if (added.layer.name !== addition.after.name) {
          const nameResponse = await connection.call({
            keymap: { setLayerProps: { layerId, name: addition.after.name } },
          });
          if (nameResponse.keymap?.setLayerProps !== 0) throw new Error(`レイヤー名「${addition.after.name}」を書き込めませんでした。`);
        }

        if (added.layer.bindings.length !== addition.after.bindings.length) {
          throw new Error("追加レイヤーのキー数がデバイスと一致しません。");
        }

        for (const [keyPosition, draftBinding] of addition.after.bindings.entries()) {
          const binding = remapBinding(draftBinding, layerIds);
          if (bindingsMatch(added.layer.bindings[keyPosition], binding)) continue;
          const bindingResponse = await connection.call({
            keymap: { setLayerBinding: { layerId, keyPosition, binding } },
          });
          if (bindingResponse.keymap?.setLayerBinding !== 0) {
            throw new Error(`${addition.after.name}のキー${keyPosition}を書き込めませんでした。`);
          }
        }
      }

      for (const change of changes) {
        if (change.type === "layerAdd") continue;
        if (change.type === "layerName") {
          const response = await connection.call({
            keymap: { setLayerProps: { layerId: change.layerId, name: change.after } },
          });
          if (response.keymap?.setLayerProps !== 0) throw new Error(`レイヤー名「${change.after}」を書き込めませんでした。`);
          continue;
        }

        const binding = remapBinding(change.after, layerIds);
        const response = await connection.call({
          keymap: {
            setLayerBinding: {
              layerId: change.layerId,
              keyPosition: change.keyPosition,
              binding: {
                behaviorId: binding.behaviorId,
                param1: binding.param1,
                param2: binding.param2,
              },
            },
          },
        });
        if (response.keymap?.setLayerBinding !== 0) {
          throw new Error(`${change.layerName}のキー${change.keyPosition}を書き込めませんでした。`);
        }
      }

      const saveResponse = await connection.call({ keymap: { saveChanges: true } });
      if (saveResponse.keymap?.saveChanges?.ok !== true) {
        throw new Error("デバイスが変更の保存を拒否しました。");
      }
    } catch (error) {
      try {
        await connection.call({ keymap: { discardChanges: true } });
      } catch {
        // Preserve the original error. A reconnect will re-read device state.
      }
      throw error;
    }

    try {
      return await this.reload();
    } catch {
      throw new Error("変更は保存されましたが、デバイスからの再読込に失敗しました。再接続して状態を確認してください。");
    }
  }

  async disconnect() {
    await this.connection?.close();
    this.connection = undefined;
    this.transport = undefined;
  }

  async getPointingSettings() {
    const connection = this.requireConnection();
    try {
      return await connection.getPointingSettings();
    } catch (error) {
      if (error instanceof PointingRpcUnsupportedError) return null;
      throw error;
    }
  }

  async savePointingSettings(settings: PointingSettings) {
    return await this.requireConnection().setPointingSettings(settings);
  }

  private requireConnection() {
    if (!this.connection) throw new Error("キーボードに接続されていません。");
    return this.connection;
  }
}
