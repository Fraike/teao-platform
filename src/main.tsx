import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// eslint-disable-next-line react-refresh/only-export-components -- The wrapper only signals the root bootstrap commit.
function AppEntry() {
  useLayoutEffect(() => {
    window.dispatchEvent(new Event("teao:app-ready"));
  }, []);
  return <App />;
}

createRoot(document.getElementById("root")!, {
  onUncaughtError(error, info) {
    console.error(error, info.componentStack);
    window.dispatchEvent(new Event("teao:app-crash"));
  },
}).render(
  <StrictMode>
    <AppEntry />
  </StrictMode>
);
