import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useWorkbenchStore } from "./store/workbenchStore";
import { isMacOS, isWindows } from "./utils/platform";
import "./index.css";

const initialTheme = useWorkbenchStore.getState().theme;
document.documentElement.dataset.platform = isMacOS()
  ? "macos"
  : isWindows()
  ? "windows"
  : "default";
document.documentElement.dataset.theme = initialTheme;
document.documentElement.style.colorScheme = initialTheme;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
