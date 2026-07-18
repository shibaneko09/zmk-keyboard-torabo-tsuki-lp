"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { FACTORY_DOCUMENT } from "../lib/default-keymap";
import { behaviorForBinding, describeBinding, diffDocuments } from "../lib/diff";
import {
  filterKeycodes,
  KEYCODE_CATEGORIES,
  KEYCODE_MODIFIERS,
  KEYCODES,
  keycodeCategory,
  keycodeLabel,
  keycodeModifiers,
  keycodeSupportsModifiers,
  withKeycodeModifiers,
} from "../lib/keycodes";
import type { KeycodeCategory } from "../lib/keycodes";
import { pushHistory, redoHistory, undoHistory } from "../lib/history";
import { bindingIndexForDisplay, displayPositionForBinding } from "../lib/layout";
import { DRAFT_STORAGE_KEY, parseDocument, serializeDocument, validateDocument } from "../lib/storage";
import type {
  BehaviorDefinition,
  Binding,
  EditorHistory,
  KeymapChange,
  KeymapDocument,
  ParameterValueDescription,
} from "../lib/types";
import { BrowserZmkClient } from "../lib/zmk-client";
import type { ZmkDeviceClient } from "../lib/zmk-client";
import {
  CURSOR_SCALE_MAX_MILLI,
  CURSOR_SCALE_MIN_MILLI,
  SCROLL_SCALE_MAX_MILLI,
  SCROLL_SCALE_MIN_MILLI,
} from "../lib/pointing-rpc-wire";
import type { PointingSettings } from "../lib/pointing-rpc-wire";

type ConnectionState = "preview" | "connecting" | "connected" | "writing" | "error";

const cloneDocument = (document: KeymapDocument): KeymapDocument => structuredClone(document);

function replaceBinding(document: KeymapDocument, layerId: number, keyPosition: number, binding: Binding) {
  return {
    ...document,
    layers: document.layers.map((layer) =>
      layer.id !== layerId
        ? layer
        : {
            ...layer,
            bindings: layer.bindings.map((current, position) => position === keyPosition ? binding : current),
          },
    ),
  };
}

function replaceLayerName(document: KeymapDocument, layerId: number, name: string) {
  return {
    ...document,
    layers: document.layers.map((layer) => layer.id === layerId ? { ...layer, name } : layer),
  };
}

function transparentBehavior(document: KeymapDocument) {
  return document.behaviors.find((behavior) =>
    behavior.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes("transparent"),
  );
}

function appendDraftLayer(document: KeymapDocument): KeymapDocument | null {
  const behavior = transparentBehavior(document);
  const availableLayers = document.availableLayers ?? 0;
  const bindingCount = document.layers[0]?.bindings.length ?? document.layout.bindingCount;
  if (!behavior || availableLayers <= 0 || bindingCount <= 0) return null;

  const temporaryLayerId = Math.min(0, ...document.layers.map((layer) => layer.id)) - 1;
  const layerIndex = document.layers.length;
  return {
    ...document,
    availableLayers: availableLayers - 1,
    layers: [
      ...document.layers,
      {
        id: temporaryLayerId,
        name: `Layer ${layerIndex}`,
        bindings: Array.from({ length: bindingCount }, () => ({
          behaviorId: behavior.id,
          param1: 0,
          param2: 0,
        })),
      },
    ],
  };
}

function defaultParameterValue(descriptions: ParameterValueDescription[], layers: KeymapDocument["layers"]) {
  const constant = descriptions.find((description) => description.kind === "constant");
  if (constant?.value !== undefined) return constant.value;
  if (descriptions.some((description) => description.kind === "hidUsage")) return KEYCODES[0].value;
  if (descriptions.some((description) => description.kind === "layerId")) return layers[0]?.id ?? 0;
  const range = descriptions.find((description) => description.kind === "range");
  return range?.min ?? 0;
}

function defaultBinding(behavior: BehaviorDefinition, layers: KeymapDocument["layers"]): Binding {
  const parameterSet = behavior.parameterSets[0] ?? { param1: [], param2: [] };
  return {
    behaviorId: behavior.id,
    param1: defaultParameterValue(parameterSet.param1, layers),
    param2: defaultParameterValue(parameterSet.param2, layers),
  };
}

function LayerRow({
  active,
  layer,
  layerIndex,
  maxNameLength,
  onSelect,
  onRename,
}: {
  active: boolean;
  layer: KeymapDocument["layers"][number];
  layerIndex: number;
  maxNameLength: number;
  onSelect: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(layer.name);

  return (
    <div className={`layer-row ${active ? "is-active" : ""}`}>
      <button className="layer-select" onClick={onSelect} aria-label={`${layer.name}レイヤーを表示`}>
        <span className="layer-index">{layerIndex}</span>
        <span className="layer-dot" aria-hidden="true" />
      </button>
      <input
        value={name}
        maxLength={maxNameLength}
        aria-label={`レイヤー${layerIndex}の名前`}
        onChange={(event) => setName(event.target.value)}
        onFocus={onSelect}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== layer.name) onRename(trimmed);
          else setName(layer.name);
        }}
      />
    </div>
  );
}

function ParameterEditor({
  label,
  descriptions,
  value,
  document,
  search,
  setSearch,
  onChange,
}: {
  label: string;
  descriptions: ParameterValueDescription[];
  value: number;
  document: KeymapDocument;
  search: string;
  setSearch: (value: string) => void;
  onChange: (value: number) => void;
}) {
  const [category, setCategory] = useState<KeycodeCategory>(() => keycodeCategory(value) ?? "letters");

  if (!descriptions.length || descriptions.every((description) => description.kind === "nil")) return null;

  const constants = descriptions.filter((description) => description.kind === "constant" && description.value !== undefined);
  if (constants.length) {
    const knownValue = constants.some((description) => description.value === value);
    return (
      <label className="field">
        <span>{label}</span>
        <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
          {!knownValue && <option value={value}>現在値 ({value})</option>}
          {constants.map((description) => <option key={`${description.name}-${description.value}`} value={description.value}>{description.name}</option>)}
        </select>
      </label>
    );
  }

  if (descriptions.some((description) => description.kind === "layerId")) {
    const knownLayer = document.layers.some((layer) => layer.id === value);
    return (
      <label className="field">
        <span>{label}</span>
        <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
          {!knownLayer && <option value={value}>現在値 ({value})</option>}
          {document.layers.map((layer, layerIndex) => <option key={layer.id} value={layer.id}>{layerIndex} · {layer.name}</option>)}
        </select>
      </label>
    );
  }

  if (descriptions.some((description) => description.kind === "hidUsage")) {
    const results = filterKeycodes(search, category);
    const modifiers = keycodeModifiers(value);
    return (
      <div className="keycode-field">
        <div className="field-heading">
          <span>{label}</span>
          <strong>{keycodeLabel(value)}</strong>
        </div>
        <input
          className="search-input"
          type="search"
          placeholder="キーコードを検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="keycode-modifiers" aria-label="同時に押す修飾キー">
          <span>同時押し</span>
          {KEYCODE_MODIFIERS.map((modifier) => {
            const selected = (modifiers & modifier.mask) !== 0;
            return (
              <button
                key={modifier.id}
                type="button"
                aria-pressed={selected}
                className={selected ? "is-selected" : ""}
                onClick={() => onChange(withKeycodeModifiers(value, modifiers ^ modifier.mask))}
              >
                {modifier.label}
              </button>
            );
          })}
        </div>
        <div className="keycode-categories" role="tablist" aria-label="キーコードのカテゴリ">
          {KEYCODE_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={category === item.id}
              className={category === item.id ? "is-selected" : ""}
              onClick={() => {
                setCategory(item.id);
                setSearch("");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {results.length ? (
          <div className="keycode-grid" role="tabpanel">
            {results.map((keycode) => {
              const combinedValue = keycodeSupportsModifiers(keycode.value)
                ? withKeycodeModifiers(keycode.value, modifiers | keycodeModifiers(keycode.value))
                : keycode.value;
              return (
                <button
                  key={`${label}-${keycode.value}`}
                  className={(value >>> 0) === combinedValue ? "is-selected" : ""}
                  onClick={() => onChange(combinedValue)}
                  title={keycode.name}
                >
                  {keycode.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="keycode-empty">このカテゴリに一致するキーコードはありません。</p>
        )}
      </div>
    );
  }

  const range = descriptions.find((description) => description.kind === "range");
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={range?.min}
        max={range?.max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function DiffDialog({
  changes,
  baseline,
  draft,
  writing,
  connected,
  onClose,
  onWrite,
}: {
  changes: KeymapChange[];
  baseline: KeymapDocument;
  draft: KeymapDocument;
  writing: boolean;
  connected: boolean;
  onClose: () => void;
  onWrite: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !writing) onClose(); }}>
      <section className="diff-dialog" role="dialog" aria-modal="true" aria-labelledby="diff-title">
        <header>
          <div>
            <span className="eyebrow">WRITE PREVIEW</span>
            <h2 id="diff-title">変更内容を確認</h2>
          </div>
          <button className="icon-button" onClick={onClose} disabled={writing} aria-label="閉じる">×</button>
        </header>
        <p className="dialog-note">{connected ? "この画面で書き込みを確定するまで、キーボードは変更されません。" : "現在はプレビューのみです。書き込むには、いったん戻ってUSB接続してください。"}</p>
        <div className="diff-list">
          {changes.flatMap((change, index) => {
            if (change.type === "layerAdd") {
              const transparentId = transparentBehavior(draft)?.id;
              const configuredBindings = change.after.bindings
                .map((binding, keyPosition) => ({ binding, keyPosition }))
                .filter(({ binding }) => binding.behaviorId !== transparentId);
              return [
                <div className="diff-item" key={`add-layer-${change.temporaryLayerId}`}>
                  <span className="diff-location">Layer {change.layerIndex}</span>
                  <span className="diff-before">未作成</span>
                  <span className="diff-arrow">→</span>
                  <span className="diff-after">{change.after.name}を追加</span>
                </div>,
                ...configuredBindings.map(({ binding, keyPosition }) => {
                  const displayPosition = displayPositionForBinding(change.after.bindings.length, keyPosition);
                  return (
                    <div className="diff-item is-layer-binding" key={`add-layer-${change.temporaryLayerId}-binding-${keyPosition}`}>
                      <span className="diff-location">{change.after.name} · Key {displayPosition === null ? keyPosition : displayPosition + 1}</span>
                      <span className="diff-before">▽</span>
                      <span className="diff-arrow">→</span>
                      <span className="diff-after">{describeBinding(draft, binding)}</span>
                    </div>
                  );
                }),
              ];
            }
            if (change.type === "layerName") {
              return [
                <div className="diff-item" key={`layer-${change.layerId}-${index}`}>
                  <span className="diff-location">Layer {change.layerId}</span>
                  <span className="diff-before">{change.before}</span>
                  <span className="diff-arrow">→</span>
                  <span className="diff-after">{change.after}</span>
                </div>,
              ];
            }
            return [
              <div className="diff-item" key={`binding-${change.layerId}-${change.keyPosition}`}>
                <span className="diff-location">{change.layerName} · Key {change.displayPosition === null ? change.keyPosition : change.displayPosition + 1}</span>
                <span className="diff-before">{describeBinding(baseline, change.before)}</span>
                <span className="diff-arrow">→</span>
                <span className="diff-after">{describeBinding(draft, change.after)}</span>
              </div>,
            ];
          })}
        </div>
        <footer>
          <span>{changes.length}件の変更</span>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={onClose} disabled={writing}>戻る</button>
            <button className="write-button" onClick={onWrite} disabled={writing || !connected}>{writing ? "書き込み中…" : connected ? "デバイスへ書き込む" : "USB接続が必要"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function PointingSettingsPanel({
  connected,
  supported,
  settings,
  changed,
  saving,
  onChange,
  onReset,
  onSave,
}: {
  connected: boolean;
  supported: boolean | null;
  settings: PointingSettings | null;
  changed: boolean;
  saving: boolean;
  onChange: (settings: PointingSettings) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <section className="pointing-panel" aria-labelledby="pointing-settings-title">
      <header>
        <div>
          <span className="eyebrow">POINTING DEVICE</span>
          <h3 id="pointing-settings-title">ポインター設定</h3>
        </div>
        <span className={`pointing-status ${connected && supported ? "is-ready" : ""}`}>
          {!connected ? "USB未接続" : supported ? "設定可能" : "未対応"}
        </span>
      </header>

      {!connected ? (
        <p className="pointing-empty">USBでキーボードへ接続すると、現在の速度とスクロール方向を読み込みます。</p>
      ) : !supported || !settings ? (
        <p className="pointing-empty">接続中のファームウェアはポインター設定RPCに対応していません。対応ファームウェアへ更新してください。</p>
      ) : (
        <div className="pointing-content">
          <label className="range-field">
            <span><strong>カーソル速度</strong><output>{(settings.cursorScaleMilli / 1000).toFixed(2)}×</output></span>
            <input
              type="range"
              min={CURSOR_SCALE_MIN_MILLI}
              max={CURSOR_SCALE_MAX_MILLI}
              step={50}
              value={settings.cursorScaleMilli}
              onChange={(event) => onChange({ ...settings, cursorScaleMilli: Number(event.target.value) })}
            />
            <small>0.25×</small><small>2.00×</small>
          </label>
          <label className="range-field">
            <span><strong>スクロール速度</strong><output>{(settings.scrollScaleMilli / 1000).toFixed(2)}×</output></span>
            <input
              type="range"
              min={SCROLL_SCALE_MIN_MILLI}
              max={SCROLL_SCALE_MAX_MILLI}
              step={50}
              value={settings.scrollScaleMilli}
              onChange={(event) => onChange({ ...settings, scrollScaleMilli: Number(event.target.value) })}
            />
            <small>0.10×</small><small>2.00×</small>
          </label>
          <div className="direction-fields">
            <span>スクロール方向</span>
            <label><input type="checkbox" checked={settings.invertScrollY} onChange={(event) => onChange({ ...settings, invertScrollY: event.target.checked })} />縦方向を反転</label>
            <label><input type="checkbox" checked={settings.invertScrollX} onChange={(event) => onChange({ ...settings, invertScrollX: event.target.checked })} />横方向を反転</label>
          </div>
          <div className="pointing-actions">
            <button className="secondary-button" onClick={onReset} disabled={saving}>初期値に戻す</button>
            <button className="write-button" onClick={onSave} disabled={!changed || saving}>{saving ? "保存中…" : changed ? "デバイスへ保存" : "保存済み"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function EditorApp() {
  const [baseline, setBaseline] = useState<KeymapDocument>(() => cloneDocument(FACTORY_DOCUMENT));
  const [history, setHistory] = useState<EditorHistory>(() => ({ past: [], present: cloneDocument(FACTORY_DOCUMENT), future: [] }));
  const [selectedLayerId, setSelectedLayerId] = useState(0);
  const [selectedDisplayPosition, setSelectedDisplayPosition] = useState<number | null>(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>("preview");
  const [message, setMessage] = useState("実機が届くまでデモデータで編集できます");
  const [search, setSearch] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);
  const [importError, setImportError] = useState("");
  const [pointingBaseline, setPointingBaseline] = useState<PointingSettings | null>(null);
  const [pointingDraft, setPointingDraft] = useState<PointingSettings | null>(null);
  const [pointingSupported, setPointingSupported] = useState<boolean | null>(null);
  const [pointingSaving, setPointingSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<ZmkDeviceClient | null>(null);

  const document = history.present;
  const selectedLayer = document.layers.find((layer) => layer.id === selectedLayerId) ?? document.layers[0];
  const selectedLayerIndex = Math.max(0, document.layers.findIndex((layer) => layer.id === selectedLayer?.id));
  const selectedBindingIndex = selectedDisplayPosition === null || !selectedLayer
    ? null
    : bindingIndexForDisplay(selectedLayer.bindings.length, selectedDisplayPosition);
  const selectedBinding = selectedBindingIndex === null ? null : selectedLayer?.bindings[selectedBindingIndex];
  const selectedBehavior = selectedBinding ? behaviorForBinding(document, selectedBinding) : undefined;
  const parameterSet = selectedBehavior?.parameterSets[0] ?? { param1: [], param2: [] };
  const changes = useMemo(() => diffDocuments(baseline, document), [baseline, document]);
  const connected = connectionState === "connected" || connectionState === "writing";
  const busy = connectionState === "connecting" || connectionState === "writing" || pointingSaving;
  const pointingChanged = Boolean(
    pointingBaseline && pointingDraft
      && (pointingBaseline.cursorScaleMilli !== pointingDraft.cursorScaleMilli
        || pointingBaseline.scrollScaleMilli !== pointingDraft.scrollScaleMilli
        || pointingBaseline.invertScrollX !== pointingDraft.invertScrollX
        || pointingBaseline.invertScrollY !== pointingDraft.invertScrollY),
  );
  const availableLayers = document.availableLayers ?? 0;
  const canAddLayer = availableLayers > 0 && Boolean(transparentBehavior(document));

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (validateDocument(parsed) && parsed.source !== "device") {
        queueMicrotask(() => {
          setHistory({ past: [], present: { ...parsed, source: "import" }, future: [] });
          setMessage("前回のローカル下書きを復元しました");
        });
      }
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!changes.length && document.source !== "import") {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, serializeDocument(document));
  }, [changes.length, document]);

  useEffect(() => () => { void clientRef.current?.disconnect(); }, []);

  const pushDocument = (next: KeymapDocument) => {
    setHistory((current) => pushHistory(current, next));
  };

  const selectLayer = (layerId: number) => {
    setSelectedLayerId(layerId);
    setSelectedDisplayPosition((current) => current ?? 0);
    setSearch("");
  };

  const updateSelectedBinding = (binding: Binding) => {
    if (!selectedLayer || selectedBindingIndex === null) return;
    pushDocument(replaceBinding(document, selectedLayer.id, selectedBindingIndex, binding));
  };

  const addLayer = () => {
    const next = appendDraftLayer(document);
    if (!next) {
      setImportError(availableLayers <= 0
        ? "追加できるレイヤーがありません。予約レイヤー入りのファームウェアへ更新してください。"
        : "Transparent Behaviorを取得できないため、レイヤーを追加できません。");
      return;
    }
    const addedLayer = next.layers[next.layers.length - 1];
    pushDocument(next);
    setSelectedLayerId(addedLayer.id);
    setSelectedDisplayPosition(0);
    setImportError("");
    setMessage(`${addedLayer.name}を下書きへ追加しました`);
  };

  const connect = async () => {
    if (changes.length && !window.confirm("USB接続すると現在の下書きをデバイスの内容で置き換えます。必要なら先にExportしてください。接続を続けますか？")) {
      return;
    }

    setConnectionState("connecting");
    setMessage("USBデバイスを選択してください");
    setImportError("");
    const client = new BrowserZmkClient();
    try {
      const loaded = await client.connect();
      const pointing = await client.getPointingSettings();
      setMessage(pointing
        ? `${loaded.device.name} · キーマップとポインター設定を読込済み`
        : `${loaded.device.name} · ポインター設定は未対応`);
      clientRef.current = client;
      setBaseline(cloneDocument(loaded));
      setHistory({ past: [], present: cloneDocument(loaded), future: [] });
      setSelectedLayerId(loaded.layers[0]?.id ?? 0);
      setSelectedDisplayPosition(0);
      setPointingSupported(pointing !== null);
      setPointingBaseline(pointing ? structuredClone(pointing) : null);
      setPointingDraft(pointing ? structuredClone(pointing) : null);
      setConnectionState("connected");
    } catch (error) {
      await client.disconnect();
      const cancelled = error instanceof DOMException && error.name === "NotFoundError";
      setConnectionState(cancelled ? "preview" : "error");
      setMessage(cancelled ? "接続はキャンセルされました" : error instanceof Error ? error.message : "USB接続に失敗しました");
    }
  };

  const disconnect = async () => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
    setPointingSupported(null);
    setPointingBaseline(null);
    setPointingDraft(null);
    setConnectionState("preview");
    setMessage("切断しました。編集内容はローカルに残っています");
  };

  const savePointingSettings = async () => {
    if (!clientRef.current || !pointingDraft || !pointingChanged) return;
    setPointingSaving(true);
    setImportError("");
    setMessage("ポインター設定を保存しています");
    try {
      const saved = await clientRef.current.savePointingSettings(pointingDraft);
      setPointingBaseline(structuredClone(saved));
      setPointingDraft(structuredClone(saved));
      setMessage("ポインター設定を保存しました。移動とスクロールへ反映されています");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "ポインター設定を保存できませんでした。");
      setMessage("ポインター設定の保存に失敗しました");
    } finally {
      setPointingSaving(false);
    }
  };

  const writeChanges = async () => {
    if (!clientRef.current || !changes.length) return;
    setConnectionState("writing");
    setMessage(`${changes.length}件の変更を書き込んでいます`);
    try {
      const reloaded = await clientRef.current.writeChanges(changes);
      setBaseline(cloneDocument(reloaded));
      setHistory({ past: [], present: cloneDocument(reloaded), future: [] });
      setSelectedLayerId(reloaded.layers[0]?.id ?? 0);
      setDiffOpen(false);
      setConnectionState("connected");
      setMessage("書き込みが完了し、デバイスから再読込しました");
    } catch (error) {
      await clientRef.current?.disconnect();
      clientRef.current = null;
      setConnectionState("error");
      setMessage(error instanceof Error ? error.message : "書き込みに失敗しました。再接続してください");
    }
  };

  const exportDocument = () => {
    const blob = new Blob([serializeDocument(document)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `torabo-tsuki-xs-keymap-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError("");
    try {
      const imported = parseDocument(await file.text());
      if (connected) {
        const deviceLayers = new Map(baseline.layers.map((layer) => [layer.id, layer]));
        const deviceAvailableLayers = baseline.availableLayers ?? 0;
        const addedLayers = imported.layers.filter((layer) => layer.id < 0);
        const existingLayers = imported.layers.filter((layer) => layer.id >= 0);
        const importedExistingPrefix = imported.layers.slice(0, baseline.layers.length);
        const importedAdditionSuffix = imported.layers.slice(baseline.layers.length);
        if (
          existingLayers.length !== baseline.layers.length ||
          addedLayers.length > deviceAvailableLayers ||
          importedExistingPrefix.some((layer, index) => layer.id !== baseline.layers[index]?.id) ||
          importedAdditionSuffix.some((layer) => layer.id >= 0) ||
          existingLayers.some((layer, index) => layer.id !== baseline.layers[index]?.id || layer.bindings.length !== deviceLayers.get(layer.id)?.bindings.length) ||
          addedLayers.some((layer) => layer.bindings.length !== baseline.layers[0]?.bindings.length)
        ) {
          throw new Error("接続中のデバイスとレイヤー構成が異なるためImportできません。");
        }
        const availableIds = new Set(document.behaviors.map((behavior) => behavior.id));
        if (imported.layers.some((layer) => layer.bindings.some((binding) => !availableIds.has(binding.behaviorId)))) {
          throw new Error("接続中のデバイスに存在しないBehaviorが含まれています。");
        }
        pushDocument({
          ...baseline,
          layers: imported.layers,
          availableLayers: deviceAvailableLayers - addedLayers.length,
          source: "device",
        });
      } else {
        pushDocument(imported);
        setSelectedLayerId(imported.layers[0]?.id ?? 0);
      }
      setMessage(`${file.name}を下書きへImportしました`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Importに失敗しました");
    }
  };

  const undo = () => setHistory(undoHistory);

  const redo = () => setHistory(redoHistory);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">月</span>
          <div>
            <h1>torabo-tsuki <em>XS</em></h1>
            <p>Keymap Editor</p>
          </div>
        </div>
        <div className="document-status">
          <span className={`status-light status-${connectionState}`} />
          <div>
            <strong>{connected ? document.device.name : "Preview mode"}</strong>
            <span>{message}</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={undo} disabled={!history.past.length || busy} title="Undo" aria-label="元に戻す">↶</button>
          <button className="icon-button" onClick={redo} disabled={!history.future.length || busy} title="Redo" aria-label="やり直す">↷</button>
          <button className="text-button" onClick={() => fileInputRef.current?.click()} disabled={busy}>Import</button>
          <button className="text-button" onClick={exportDocument} disabled={busy}>Export</button>
          {connected ? (
            <button className="connection-button is-connected" onClick={disconnect} disabled={busy}>USBを切断</button>
          ) : (
            <button className="connection-button" onClick={connect} disabled={busy}>{connectionState === "connecting" ? "接続中…" : "USBで接続"}</button>
          )}
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={importDocument} />
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="section-heading">
            <span className="eyebrow">LAYERS</span>
            <span>{document.layers.length}</span>
          </div>
          <div className="layer-list">
            {document.layers.map((layer, layerIndex) => (
              <LayerRow
                key={`${layer.id}-${layer.name}`}
                layer={layer}
                layerIndex={layerIndex}
                maxNameLength={document.maxLayerNameLength ?? 20}
                active={layer.id === selectedLayer?.id}
                onSelect={() => selectLayer(layer.id)}
                onRename={(name) => pushDocument(replaceLayerName(document, layer.id, name))}
              />
            ))}
          </div>
          <div className="layer-actions">
            <button className="add-layer-button" onClick={addLayer} disabled={busy || !canAddLayer}>＋ レイヤーを追加</button>
            <span>{availableLayers > 0 ? `残り ${availableLayers}` : "空きなし"}</span>
          </div>
          <div className="sidebar-note">
            <span>XS / S Layout</span>
            <strong>44 keys</strong>
            <p>右手トラックボール構成のプレビューです。</p>
          </div>
        </aside>

        <section className="editor-stage">
          <div className="stage-header">
            <div>
              <span className="eyebrow">CURRENT LAYER</span>
              <h2><span>{selectedLayerIndex}</span>{selectedLayer?.name}</h2>
            </div>
            <div className="stage-tools">
              <span className="draft-badge">{changes.length ? `${changes.length} changes` : "No changes"}</span>
              <button className="reset-button" disabled={!changes.length || busy} onClick={() => setHistory({ past: [], present: cloneDocument(baseline), future: [] })}>変更を破棄</button>
              <button className="review-button" disabled={!changes.length || busy} onClick={() => setDiffOpen(true)}>差分を確認</button>
            </div>
          </div>

          {importError && <div className="error-banner" role="alert">{importError}</div>}

          <div className="keyboard-card">
            <div className="keyboard-meta"><span>L</span><span className="trackball-label">RIGHT TRACKBALL</span><span>R</span></div>
            <div className="keyboard-canvas" aria-label={`${selectedLayer?.name}レイヤーのキーボード`}>
              <div className="split-shadow left" aria-hidden="true" />
              <div className="split-shadow right" aria-hidden="true" />
              <div className="trackball" aria-hidden="true"><span /></div>
              {document.layout.keys.map((key) => {
                const keyPosition = bindingIndexForDisplay(selectedLayer?.bindings.length ?? document.layout.bindingCount, key.displayPosition);
                const currentBinding = selectedLayer?.bindings[keyPosition];
                const changed = changes.some((change) => change.type === "binding" && change.layerId === selectedLayer?.id && change.keyPosition === keyPosition);
                const style = {
                  "--key-x": key.x,
                  "--key-y": key.y,
                  "--key-w": key.width,
                  "--key-h": key.height,
                  "--key-r": key.rotation,
                  "--key-rx": key.rotationX,
                  "--key-ry": key.rotationY,
                } as CSSProperties;
                return (
                  <button
                    key={key.displayPosition}
                    style={style}
                    className={`keycap ${selectedDisplayPosition === key.displayPosition ? "is-selected" : ""} ${changed ? "is-changed" : ""}`}
                    onClick={() => { setSelectedDisplayPosition(key.displayPosition); setSearch(""); }}
                    aria-label={`キー${key.displayPosition + 1}: ${currentBinding ? describeBinding(document, currentBinding) : "未設定"}`}
                  >
                    <span className="key-number">{key.displayPosition + 1}</span>
                    <strong>{currentBinding ? describeBinding(document, currentBinding) : "—"}</strong>
                    {changed && <span className="change-dot" />}
                  </button>
                );
              })}
            </div>
          </div>

          <PointingSettingsPanel
            connected={connected}
            supported={pointingSupported}
            settings={pointingDraft}
            changed={pointingChanged}
            saving={pointingSaving}
            onChange={setPointingDraft}
            onReset={() => setPointingDraft({
              cursorScaleMilli: 1000,
              scrollScaleMilli: 333,
              invertScrollX: true,
              invertScrollY: false,
            })}
            onSave={savePointingSettings}
          />

          <section className="config-panel">
            <header>
              <div>
                <span className="eyebrow">KEY CONFIG</span>
                <h3>{selectedDisplayPosition === null ? "キーを選択" : `Key ${selectedDisplayPosition + 1}`}</h3>
              </div>
              {selectedBinding && <code>position {selectedBindingIndex}</code>}
            </header>
            {!selectedBinding || !selectedLayer ? (
              <div className="empty-config">キーボード上のキーを選択してください。</div>
            ) : (
              <div className="config-content">
                <label className="field behavior-field">
                  <span>Behavior</span>
                  <select
                    value={selectedBinding.behaviorId}
                    onChange={(event) => {
                      const behavior = document.behaviors.find((candidate) => candidate.id === Number(event.target.value));
                      if (behavior) updateSelectedBinding(defaultBinding(behavior, document.layers));
                    }}
                  >
                    {!selectedBehavior && <option value={selectedBinding.behaviorId}>未知のBehavior {selectedBinding.behaviorId}</option>}
                    {document.behaviors.map((behavior) => <option key={behavior.id} value={behavior.id}>{behavior.name}</option>)}
                  </select>
                </label>
                <ParameterEditor
                  key={`param1-${selectedLayer.id}-${selectedBindingIndex}-${selectedBinding.behaviorId}`}
                  label={parameterSet.param1[0]?.name || "Parameter 1"}
                  descriptions={parameterSet.param1}
                  value={selectedBinding.param1}
                  document={document}
                  search={search}
                  setSearch={setSearch}
                  onChange={(param1) => updateSelectedBinding({ ...selectedBinding, param1, label: undefined })}
                />
                <ParameterEditor
                  key={`param2-${selectedLayer.id}-${selectedBindingIndex}-${selectedBinding.behaviorId}`}
                  label={parameterSet.param2[0]?.name || "Parameter 2"}
                  descriptions={parameterSet.param2}
                  value={selectedBinding.param2}
                  document={document}
                  search={search}
                  setSearch={setSearch}
                  onChange={(param2) => updateSelectedBinding({ ...selectedBinding, param2, label: undefined })}
                />
                {!selectedBehavior && (
                  <div className="unknown-behavior">
                    <strong>未知のBehavior {selectedBinding.behaviorId}</strong>
                    <p>この割り当ては保持されています。内容を理解できるBehaviorへ変更するまで、値は書き換えません。</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </section>
      </div>

      <footer className="footerbar">
        <span>Local only · No telemetry</span>
        <span>{document.layout.name} · {document.layers.length} layers · 44 visible keys</span>
        <span>{connected ? `Serial ${document.device.serialNumber}` : "Device not connected"}</span>
      </footer>

      {diffOpen && (
        <DiffDialog
          changes={changes}
          baseline={baseline}
          draft={document}
          writing={connectionState === "writing"}
          connected={connected}
          onClose={() => setDiffOpen(false)}
          onWrite={writeChanges}
        />
      )}
    </main>
  );
}
