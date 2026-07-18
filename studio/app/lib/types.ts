export type Binding = {
  behaviorId: number;
  param1: number;
  param2: number;
  label?: string;
};

export type ParameterValueDescription = {
  name: string;
  kind: "nil" | "constant" | "range" | "hidUsage" | "layerId";
  value?: number;
  min?: number;
  max?: number;
  keyboardMax?: number;
  consumerMax?: number;
};

export type ParameterSet = {
  param1: ParameterValueDescription[];
  param2: ParameterValueDescription[];
};

export type BehaviorDefinition = {
  id: number;
  name: string;
  parameterSets: ParameterSet[];
};

export type KeymapLayer = {
  id: number;
  name: string;
  bindings: Binding[];
};

export type PhysicalKey = {
  displayPosition: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  rotationX: number;
  rotationY: number;
};

export type KeymapDocument = {
  schemaVersion: 1;
  source: "factory" | "device" | "import";
  device: {
    name: string;
    serialNumber: string;
    transportLabel?: string;
  };
  layout: {
    name: string;
    keys: PhysicalKey[];
    bindingCount: number;
  };
  behaviors: BehaviorDefinition[];
  layers: KeymapLayer[];
  availableLayers?: number;
  maxLayerNameLength?: number;
};

export type BindingChange = {
  type: "binding";
  layerId: number;
  layerName: string;
  keyPosition: number;
  displayPosition: number | null;
  before: Binding;
  after: Binding;
};

export type LayerNameChange = {
  type: "layerName";
  layerId: number;
  before: string;
  after: string;
};

export type LayerAddChange = {
  type: "layerAdd";
  temporaryLayerId: number;
  layerIndex: number;
  after: KeymapLayer;
};

export type KeymapChange = BindingChange | LayerNameChange | LayerAddChange;

export type EditorHistory = {
  past: KeymapDocument[];
  present: KeymapDocument;
  future: KeymapDocument[];
};
