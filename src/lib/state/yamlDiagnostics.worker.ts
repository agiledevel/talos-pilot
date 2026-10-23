import {
  analyzeYaml,
  isYamlWorkerRequest,
  type YamlWorkerResponse,
} from "../../features/editor/yamlAnalysis";

interface WorkerScope {
  postMessage(message: YamlWorkerResponse): void;
}

/**
 * The dedicated worker global has a `postMessage` signature that differs from
 * the DOM `Window` declaration in the project's single TypeScript program. A
 * structural guard keeps the call checked without an unchecked cast.
 */
function isWorkerScope(value: unknown): value is WorkerScope {
  return (
    typeof value === "object" &&
    value !== null &&
    "postMessage" in value &&
    typeof value.postMessage === "function"
  );
}

function post(response: YamlWorkerResponse): void {
  const scope: unknown = globalThis;
  if (isWorkerScope(scope)) {
    scope.postMessage(response);
  }
}

globalThis.addEventListener("message", (event: MessageEvent) => {
  const payload: unknown = event.data;
  if (!isYamlWorkerRequest(payload)) {
    return;
  }
  post({
    requestId: payload.requestId,
    diagnostics: analyzeYaml(payload.text).diagnostics,
  });
});
