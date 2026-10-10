import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PilotApp } from "./components/PilotApp";
import type { IpcTransport } from "./lib/ipc/transport";
import { createNativeIpcTransport } from "./lib/ipc/transport";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The application root is missing.");
}
let transport: IpcTransport | undefined;
try {
  transport = createNativeIpcTransport();
} catch {
  transport = undefined;
}
createRoot(root).render(
  <StrictMode>
    {transport === undefined ? <PilotApp /> : <PilotApp transport={transport} />}
  </StrictMode>,
);
