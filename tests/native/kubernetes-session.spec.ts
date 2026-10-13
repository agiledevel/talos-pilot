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
    assert.deepEqual(results, ["denied", "denied", "denied", "denied", "denied"]);
  });
});
