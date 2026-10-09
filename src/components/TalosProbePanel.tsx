import { useEffect, useRef, useState } from "react";
import { Alert, Button, Select, Space, Typography } from "antd";
import type { TalosCredentialSessionDto } from "../lib/ipc/generated/TalosCredentialSessionDto";
import type { TalosProbeEventDto } from "../lib/ipc/generated/TalosProbeEventDto";
import type { TalosProbeState } from "../lib/ipc/generated/TalosProbeState";
import type { IpcTransport } from "../lib/ipc/transport";
import {
  closeTalosSession,
  IpcApplicationError,
  importTalosconfig,
  startTalosProbe,
  stopTalosProbe,
} from "../lib/ipc/transport";
import { IpcContractError } from "../lib/ipc/validation";
import styles from "./PilotApp.module.css";

/** Lets a user import a native talosconfig and run one read-only Talos probe. */
export function TalosProbePanel({ transport }: { readonly transport: IpcTransport | undefined }) {
  const [session, setSession] = useState<TalosCredentialSessionDto | null>(null);
  const [node, setNode] = useState("");
  const [event, setEvent] = useState<TalosProbeEventDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const sessionRef = useRef<TalosCredentialSessionDto | null>(null);
  const probingRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(
    () => () => {
      const activeSession = sessionRef.current;
      if (transport === undefined || activeSession === null) {
        return;
      }
      if (probingRef.current) {
        void stopTalosProbe(transport, activeSession.session_id).catch(() => undefined);
      }
      void closeTalosSession(transport, activeSession.session_id).catch(() => undefined);
    },
    [transport],
  );

  async function importContext(): Promise<void> {
    if (transport === undefined || session !== null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const imported = await importTalosconfig(transport);
      if (imported !== null) {
        setSession(imported);
        setNode(imported.nodes[0] ?? "");
        setEvent(null);
      }
    } catch (cause: unknown) {
      setError(errorMessage(cause, "The Talos config could not be imported."));
    } finally {
      setBusy(false);
    }
  }

  async function runProbe(): Promise<void> {
    if (transport === undefined || session === null || node === "") {
      return;
    }
    setError(null);
    setProbing(true);
    probingRef.current = true;
    let sawHealthy = false;
    const trackEvent = (next: TalosProbeEventDto): void => {
      if (next.state === "healthy") {
        sawHealthy = true;
      }
      setEvent(next);
    };
    setEvent({
      session_id: session.session_id,
      state: "connecting",
      version: null,
      stage: null,
      ready: null,
      deleted: false,
      sequence: "0",
    });
    try {
      await startTalosProbe(transport, session.session_id, node, trackEvent);
      // A stream that ends without a later event can no longer be current.
      setEvent((current) =>
        current !== null && sawHealthy ? { ...current, state: "stale" } : current,
      );
    } catch (cause: unknown) {
      const state = probeFailureState(cause);
      setEvent((current) => {
        if (current === null || (state === "stale" && !sawHealthy)) {
          return current;
        }
        return { ...current, state };
      });
      setError(errorMessage(cause, "The Talos read probe could not complete."));
    } finally {
      setProbing(false);
      probingRef.current = false;
    }
  }

  async function stopProbe(): Promise<void> {
    if (transport === undefined || session === null || !probing) {
      return;
    }
    setError(null);
    try {
      await stopTalosProbe(transport, session.session_id);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "The Talos stream could not be stopped."));
    }
  }

  async function closeSession(): Promise<void> {
    if (transport === undefined || session === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (probing) {
        await stopTalosProbe(transport, session.session_id);
      }
      await closeTalosSession(transport, session.session_id);
      setSession(null);
      setNode("");
      setEvent(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "The in-memory Talos session could not be closed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.credentials} aria-labelledby="talos-probe-title">
      <Typography.Title id="talos-probe-title" level={3}>
        Talos read probe
      </Typography.Title>
      {session === null ? (
        <Typography.Paragraph>
          Import a Talos context from the native picker. Its inline mTLS credentials stay in memory
          until you close the context or exit the application.
        </Typography.Paragraph>
      ) : (
        <>
          <Alert
            type="warning"
            showIcon
            title={`Session-only context “${session.context_name}”. Credentials are held in memory.`}
          />
          <Typography.Paragraph>
            Talos API endpoints: {session.endpoints.join(", ")}
          </Typography.Paragraph>
          <Select
            aria-label="Talos node target"
            value={node}
            disabled={busy || probing}
            options={session.nodes.map((target) => ({ label: target, value: target }))}
            onChange={setNode}
          />
        </>
      )}
      {event !== null && (
        <output aria-live="polite">
          <Typography.Text strong>Talos: {event.state.replaceAll("_", " ")}</Typography.Text>
          {event.version !== null && (
            <Typography.Paragraph>Version: {event.version}</Typography.Paragraph>
          )}
          {event.stage !== null && (
            <Typography.Paragraph>Stage: {event.stage}</Typography.Paragraph>
          )}
          {event.ready !== null && (
            <Typography.Paragraph>Ready: {event.ready ? "Yes" : "No"}</Typography.Paragraph>
          )}
        </output>
      )}
      <Space wrap>
        {session === null ? (
          <Button
            type="primary"
            disabled={transport === undefined || busy}
            loading={busy}
            aria-describedby={error === null ? undefined : "talos-probe-error"}
            onClick={() => void importContext()}
          >
            Import Talos config
          </Button>
        ) : (
          <>
            <Button
              type="primary"
              disabled={transport === undefined || busy || probing || node === ""}
              loading={probing}
              aria-describedby={error === null ? undefined : "talos-probe-error"}
              onClick={() => void runProbe()}
            >
              Start read probe
            </Button>
            <Button
              disabled={!probing || busy}
              aria-describedby={error === null ? undefined : "talos-probe-error"}
              onClick={() => void stopProbe()}
            >
              Stop stream
            </Button>
            <Button
              disabled={busy}
              aria-describedby={error === null ? undefined : "talos-probe-error"}
              onClick={() => void closeSession()}
            >
              Close Talos context
            </Button>
          </>
        )}
      </Space>
      {error !== null && (
        <Alert
          id="talos-probe-error"
          role="alert"
          className={styles.actionMessage ?? ""}
          type="error"
          showIcon
          title={error}
        />
      )}
    </section>
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof IpcApplicationError) {
    return cause.message;
  }
  if (cause instanceof IpcContractError) {
    return "The native application returned an invalid Talos probe response.";
  }
  return fallback;
}

function probeFailureState(cause: unknown): TalosProbeState {
  if (!(cause instanceof IpcApplicationError)) {
    return "stale";
  }
  switch (cause.detail.code) {
    case "TALOS_UNAUTHORIZED":
      return "unauthorized";
    case "TALOS_CERTIFICATE_INVALID":
      return "certificate_invalid";
    case "TALOS_UNAVAILABLE":
      return "unavailable";
    case "TALOS_UNSUPPORTED":
      return "unsupported";
    default:
      return "stale";
  }
}
