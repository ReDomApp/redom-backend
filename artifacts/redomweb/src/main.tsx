import { Component, StrictMode, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ReDom web app failed to render.", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot-error">
          <div className="boot-error-card">
            <div className="boot-error-mark">R</div>
            <h1>ReDom could not start</h1>
            <p>The current web build encountered an unexpected startup error.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppBoot() {
  useEffect(() => {
    document.documentElement.dataset.redomReady = "true";
  }, []);

  return <App />;
}

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <AppBoot />
      </ErrorBoundary>
    </StrictMode>,
  );
}
