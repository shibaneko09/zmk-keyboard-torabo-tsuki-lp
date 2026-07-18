import type { EditorHistory, KeymapDocument } from "./types";

export function pushHistory(history: EditorHistory, next: KeymapDocument): EditorHistory {
  return {
    past: [...history.past, history.present].slice(-80),
    present: next,
    future: [],
  };
}

export function undoHistory(history: EditorHistory): EditorHistory {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: EditorHistory): EditorHistory {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
