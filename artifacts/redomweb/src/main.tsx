import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function AppBoot() {
  useEffect(() => {
    document.getElementById("fallback-shell")?.setAttribute("hidden", "");
  }, []);

  return <App />;
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AppBoot />
    </StrictMode>,
  );
}
