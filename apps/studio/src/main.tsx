import "@fontsource-variable/instrument-sans";
import "@fontsource/source-sans-3/300.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/source-sans-3/300-italic.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
