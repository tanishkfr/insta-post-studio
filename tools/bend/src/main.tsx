import "@fontsource-variable/inter";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/space-grotesk";
import "./styles/tokens.css";
import "./styles/global.css";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import { App } from "./app/App";
import { StudioBendBridgeRoot, readStudioBoot } from "./integration/studioBridge";

const studioBoot = readStudioBoot();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <MotionConfig reducedMotion="user">
    {studioBoot ? <StudioBendBridgeRoot boot={studioBoot} /> : <App />}
  </MotionConfig>,
);

