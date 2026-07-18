import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EditorApp } from "../../app/components/EditorApp";
import "../../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Electron renderer root was not found.");
}

createRoot(root).render(
  <StrictMode>
    <EditorApp />
  </StrictMode>,
);
