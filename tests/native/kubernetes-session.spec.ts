import assert from "node:assert/strict";

import { browser } from "@wdio/globals";
import { withExecuteOptions } from "@wdio/tauri-service";
import { describe, it } from "mocha";

/*
 * The native-test application is started by `pnpm test:native` with
 * `TALOS_PILOT_NATIVE_TEST_KUBERNETES_DIR` naming a temporary directory that
 * holds a synthetic kubeconfig written by the synthetic Kubernetes endpoint the
 * harness starts. The credential reaches the backend as a file the test-only
 * startup path imports, never through IPC.
 *
 * These specs therefore exercise the real command surface, a real credential
 * handle, and the real TLS client against that endpoint. They cannot establish
 * behaviour against a Kubernetes cluster: the first live cluster read belongs
 * to the following packet.
 *
 * Every callback below runs inside the webview, so each one is self-contained:
 * it may not reference a helper defined in this module, because only the
 * function body is serialised across the driver.
 */

const UNSET_HANDLE = "kubecred-AAAAAAAAAAAAAAAAAAAAAA";
const UNSET_SESSION = "kube-session-404";

/** Narrows a projection field to its string value, or an empty string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Reads a projection and asserts it is a plain object, inside the webview. */
const readRecord = async (
  command: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> => {
  const value: unknown = await browser.tauri.execute(
    async ({ core }, wanted) => {
      const call = wanted as { command: string; args: Record<string, unknown> };
      const result: unknown = await core.invoke(call.command, call.args);
      if (typeof result !== "object" || result === null || Array.isArray(result)) {
        throw new Error("expected an object projection");
      }
      return result;
    },
    { command, args },
  );
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
};

/** Reads the safe application error code from a rejected command. */
async function rejectedCode(command: string, args: Record<string, unknown> = {}): Promise<string> {
  const code: unknown = await browser.tauri.execute(
    async ({ core }, wanted) => {
      const call = wanted as { command: string; args: Record<string, unknown> };
      try {
        await core.invoke(call.command, call.args);
        return "unexpectedly-allowed";
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          !Array.isArray(error) &&
          typeof (error as Record<string, unknown>)["code"] === "string"
        ) {
          return (error as Record<string, unknown>)["code"];
        }
        return "uncoded";
      }
    },
    { command, args },
  );
  if (typeof code !== "string") {
    throw new Error("the rejected command did not report a safe error code");
  }
  return code;
}

describe("native Kubernetes credential and session boundary", () => {
  it("lists the injected credential, reads the version, and closes the session", async () => {
    const listing: unknown = await browser.tauri.execute(({ core }) =>
      core.invoke("list_kubernetes_credentials"),
    );
    assert.ok(Array.isArray(listing));
    assert.equal(listing.length, 1);
    const credential = listing[0] as Record<string, unknown>;
    const handle = asString(credential["credential_handle"]);
    assert.match(handle, /^kubecred-[A-Za-z0-9_-]{22}$/u);
    assert.equal(credential["context_label"], "synthetic-native-test");
    assert.equal(credential["storage_mode"], "session_only");

    const session = await readRecord("open_kubernetes_session", {
      credentialHandle: handle,
    });
    const sessionId = asString(session["session_id"]);
    assert.match(sessionId, /^kube-session-[0-9]+$/u);
    assert.equal(session["context_label"], "synthetic-native-test");
    assert.equal(session["storage_mode"], "session_only");

    const version = await readRecord("read_kubernetes_version", {
      sessionId,
    });
    assert.deepEqual(version, {
      session_id: sessionId,
      version: "v1.36.5",
      major: "1",
      minor: "36",
    });

    const pods = await readRecord("list_kubernetes_pods", {
      sessionId,
      namespace: "workloads",
      labelSelector: null,
      fieldSelector: null,
    });
    assert.equal(pods["session_id"], sessionId);
    assert.equal(pods["namespace"], "workloads");
    assert.equal(pods["resource_version"], "42");
    assert.equal(pods["complete"], true);
    assert.deepEqual(pods["items"], [
      {
        name: "first",
        namespace: "workloads",
        uid: "uid-first",
        resource_version: "42",
        phase: "Running",
        readiness: "ready",
      },
      {
        name: "second",
        namespace: "workloads",
        uid: "uid-second",
        resource_version: "42",
        phase: "Running",
        readiness: "ready",
      },
    ]);

    const closed = await browser.tauri.execute(
      ({ core }, wanted) => core.invoke("close_kubernetes_session", { sessionId: wanted }),
      sessionId,
    );
    assert.equal(closed, true);
    assert.equal(
      await rejectedCode("read_kubernetes_version", { sessionId }),
      "KUBERNETES_SESSION_UNKNOWN",
    );
  });

  it("rejects an unknown credential handle and an unknown session", async () => {
    assert.equal(
      await rejectedCode("open_kubernetes_session", { credentialHandle: UNSET_HANDLE }),
      "KUBERNETES_CREDENTIAL_UNKNOWN",
    );
    assert.equal(
      await rejectedCode("read_kubernetes_version", { sessionId: UNSET_SESSION }),
      "KUBERNETES_SESSION_UNKNOWN",
    );
    // Closing is idempotent and acts only on the session it names: an unknown
    // session releases nothing and reports that it owned nothing.
    const closed: unknown = await browser.tauri.execute(
      ({ core }, sessionId) => core.invoke("close_kubernetes_session", { sessionId }),
      UNSET_SESSION,
    );
    assert.equal(closed, false);
  });

  it("enforces the four-session ceiling and releases every session it opened", async () => {
    const opened: unknown = await browser.tauri.execute(async ({ core }) => {
      const listing: unknown = await core.invoke("list_kubernetes_credentials");
      const first = Array.isArray(listing)
        ? (listing[0] as Record<string, unknown> | undefined)
        : undefined;
      const handleValue = first?.["credential_handle"];
      const handle = typeof handleValue === "string" ? handleValue : "";
      const sessions: string[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const session = (await core.invoke("open_kubernetes_session", {
            credentialHandle: handle,
          })) as Record<string, unknown>;
          const id = session["session_id"];
          sessions.push(typeof id === "string" ? id : "");
        } catch (error: unknown) {
          const code =
            typeof error === "object" && error !== null
              ? (error as Record<string, unknown>)["code"]
              : "uncoded";
          return { sessions, rejection: code };
        }
      }
      return { sessions, rejection: "none" };
    });
    const result = opened as { sessions: string[]; rejection: unknown };
    assert.equal(result.sessions.length, 4);
    assert.equal(result.rejection, "KUBERNETES_SESSION_LIMIT");

    const closed: unknown = await browser.tauri.execute(async ({ core }, sessionIds) => {
      const results: unknown[] = [];
      for (const sessionId of sessionIds as string[]) {
        results.push(await core.invoke("close_kubernetes_session", { sessionId }));
      }
      return results;
    }, result.sessions);
    assert.deepEqual(closed, [true, true, true, true]);
  });

  it("delivers ordered acknowledged live Pod changes through the real Tauri channel", async () => {
    await openWorkloadsView();
    await clickMainButton("Load saved contexts");
    await waitForEnabledButton("Open Kubernetes session");
    await clickMainButton("Open Kubernetes session");
    await browser.waitUntil(async () =>
      (await browser.tauri.execute(() => document.body.innerText))
        .toString()
        .includes("synthetic-native-test"),
    );
    await browser.tauri.execute(() => {
      const namespaceLabel = [...document.querySelectorAll("label")].find((label) =>
        label.textContent?.includes("Namespace"),
      );
      const input = namespaceLabel?.querySelector("input");
      if (input === null || input === undefined) {
        throw new Error("the Workloads namespace input was not rendered");
      }
      input.value = "workloads";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickMainButton("List Pods");
    await browser.waitUntil(
      async () =>
        (await browser.tauri.execute(() => document.querySelectorAll("tbody tr").length)) === 2,
    );
    await clickMainButton("Start live watch");
    await browser.waitUntil(
      async () =>
        await browser.tauri.execute(() => {
          const rows = [...document.querySelectorAll<HTMLTableRowElement>("tbody tr")];
          const first = rows.find((row) => row.dataset.podUid === "uid-first");
          const recreated = rows.find((row) => row.dataset.podUid === "uid-second-recreated");
          return first?.innerText.includes("Pending") === true && recreated !== undefined;
        }),
      { timeout: 15_000, timeoutMsg: "the acknowledged synthetic watch events were not applied" },
    );
    const state = await browser.tauri.execute(() => document.body.innerText);
    assert.match(String(state), /Live Pod updates are current\./u);
    await clickMainButton("Stop live watch");
    await clickMainButton("Close Kubernetes session");
    await browser.waitUntil(async () =>
      (await browser.tauri.execute(() => document.body.innerText))
        .toString()
        .includes("No Kubernetes session is open."),
    );
  });

  it("joins the active native watch when its Kubernetes session closes", async () => {
    await openWorkloadsView();
    await clickMainButton("Load saved contexts");
    await waitForEnabledButton("Open Kubernetes session");
    await clickMainButton("Open Kubernetes session");
    await browser.waitUntil(async () =>
      (await browser.tauri.execute(() => document.body.innerText))
        .toString()
        .includes("synthetic-native-test"),
    );
    await browser.tauri.execute(() => {
      const label = [...document.querySelectorAll("label")].find((item) =>
        item.textContent?.includes("Namespace"),
      );
      const input = label?.querySelector("input");
      if (input === null || input === undefined) {
        throw new Error("the Workloads namespace input could not be updated");
      }
      input.value = "workloads";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickMainButton("List Pods");
    await browser.waitUntil(
      async () =>
        (await browser.tauri.execute(() => document.querySelectorAll("tbody tr").length)) === 2,
    );
    await clickMainButton("Start live watch");
    await browser.waitUntil(async () =>
      (await browser.tauri.execute(() => document.body.innerText))
        .toString()
        .includes("Live Pod updates are current."),
    );
    await clickMainButton("Close Kubernetes session");
    await browser.waitUntil(async () =>
      (await browser.tauri.execute(() => document.body.innerText))
        .toString()
        .includes("No Kubernetes session is open."),
    );
  });

  it("stops a native watch when its Tauri channel consumer closes", async () => {
    const result: unknown = await browser.tauri.execute(async ({ core }) => {
      type NativeChannel = {
        id: number;
        onmessage: (message: unknown) => void;
        cleanupCallback: () => void;
      };
      type NativeChannelConstructor = new (onmessage?: (message: unknown) => void) => NativeChannel;
      type TauriGlobal = { __TAURI__?: { core?: { Channel?: NativeChannelConstructor } } };
      const tauri = window as unknown as TauriGlobal;
      const Channel = tauri.__TAURI__?.core?.Channel;
      if (Channel === undefined) throw new Error("the native Tauri Channel API was unavailable");

      const credentials: unknown = await core.invoke("list_kubernetes_credentials");
      if (!Array.isArray(credentials) || credentials.length !== 1) {
        throw new Error("the native-test credential was unavailable");
      }
      const credential = credentials[0] as { credential_handle?: unknown };
      if (typeof credential.credential_handle !== "string") {
        throw new Error("the native-test credential handle was malformed");
      }
      const session: unknown = await core.invoke("open_kubernetes_session", {
        credentialHandle: credential.credential_handle,
      });
      if (typeof session !== "object" || session === null) {
        throw new Error("the native Kubernetes session was malformed");
      }
      const sessionId = (session as { session_id?: unknown }).session_id;
      if (typeof sessionId !== "string") throw new Error("the session identity was missing");
      const subscription: unknown = await core.invoke("open_kubernetes_pod_watch", {
        sessionId,
        namespace: "workloads",
      });
      if (typeof subscription !== "object" || subscription === null) {
        throw new Error("the native watch subscription was malformed");
      }
      const subscriptionId = (subscription as { subscription_id?: unknown }).subscription_id;
      if (typeof subscriptionId !== "string") throw new Error("the watch identity was missing");

      let received = 0;
      const channel = new Channel();
      channel.onmessage = () => {
        received += 1;
        channel.cleanupCallback();
        // Closing the renderer callback also withholds the acknowledgement.
      };
      const end: unknown = await core.invoke("stream_kubernetes_pod_watch", {
        sessionId,
        subscriptionId,
        channel,
      });
      await core.invoke("close_kubernetes_session", { sessionId });
      return { end, received };
    });
    assert.deepEqual(result, { end: "acknowledgement_timeout", received: 1 });
  });

  it("denies the Kubernetes commands to a window without their capability", async () => {
    const results: unknown = await browser.tauri.execute(
      async ({ core }) => {
        const attempted = [
          ["list_kubernetes_credentials", {}],
          ["open_kubernetes_session", { credentialHandle: "kubecred-AAAAAAAAAAAAAAAAAAAAAA" }],
          ["read_kubernetes_version", { sessionId: "kube-session-404" }],
          [
            "list_kubernetes_pods",
            {
              sessionId: "kube-session-404",
              namespace: "workloads",
              labelSelector: null,
              fieldSelector: null,
            },
          ],
          ["close_kubernetes_session", { sessionId: "kube-session-404" }],
          ["open_kubernetes_pod_watch", { sessionId: "kube-session-404", namespace: "workloads" }],
          [
            "stream_kubernetes_pod_watch",
            { sessionId: "kube-session-404", subscriptionId: "kube-watch-1" },
          ],
          [
            "acknowledge_kubernetes_pod_watch",
            { sessionId: "kube-session-404", subscriptionId: "kube-watch-1", sequence: "1" },
          ],
          [
            "stop_kubernetes_pod_watch",
            { sessionId: "kube-session-404", subscriptionId: "kube-watch-1" },
          ],
        ] as const;
        const outcomes: string[] = [];
        for (const [command, args] of attempted) {
          try {
            await core.invoke(command, args);
            outcomes.push("unexpectedly-allowed");
          } catch {
            outcomes.push("denied");
          }
        }
        return outcomes;
      },
      withExecuteOptions({ windowLabel: "unauthorized" }),
    );
    assert.deepEqual(results, [
      "denied",
      "denied",
      "denied",
      "denied",
      "denied",
      "denied",
      "denied",
      "denied",
      "denied",
    ]);
  });
});

async function openWorkloadsView(): Promise<void> {
  await browser.tauri.execute(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("nav button")].find(
      (candidate) => candidate.innerText.trim() === "Workloads",
    );
    if (button === undefined) {
      throw new Error("the Workloads navigation entry was not rendered");
    }
    button.click();
  });
}

async function clickMainButton(label: string): Promise<void> {
  await browser.tauri.execute((_tauri, expected) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.innerText.trim() === expected,
    );
    if (button === undefined || button.disabled) {
      throw new Error(`the ${expected} button is unavailable`);
    }
    button.click();
  }, label);
}

async function waitForEnabledButton(label: string): Promise<void> {
  await browser.waitUntil(
    async () =>
      await browser.tauri.execute(
        (_tauri, expected) =>
          [...document.querySelectorAll<HTMLButtonElement>("button")].some(
            (button) => button.innerText.trim() === expected && !button.disabled,
          ),
        label,
      ),
    { timeout: 10_000, timeoutMsg: `${label} did not become available` },
  );
}
