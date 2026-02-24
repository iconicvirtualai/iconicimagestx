import { createRoot, Root } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

// Extend window interface for TypeScript
declare global {
  interface Window {
    __reactRoot?: Root;
  }
}

// Reuse the existing root if it exists to avoid the ReactDOMClient.createRoot() warning during HMR
if (!window.__reactRoot) {
  window.__reactRoot = createRoot(rootElement);
}

window.__reactRoot.render(<App />);
