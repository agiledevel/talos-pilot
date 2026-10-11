import { mount } from "svelte";
import PilotApp from "./components/PilotApp.svelte";
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
mount(PilotApp, { target: root, props: { transport } });
