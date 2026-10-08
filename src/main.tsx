import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PilotApp } from "./components/PilotApp";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The application root is missing.");
}
createRoot(root).render(
  <StrictMode>
    <PilotApp />
  </StrictMode>,
);
