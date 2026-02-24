import { createRoot } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

// Create root and render
// To avoid the createRoot warning during HMR, we can check if a root is already attached
// But in this environment, simply rendering is often safer than complex persistence
createRoot(rootElement).render(<App />);
