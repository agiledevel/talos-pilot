import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  ConfigProvider,
  Empty,
  Layout,
  Radio,
  Space,
  Typography,
  theme,
} from "antd";
import type { RadioChangeEvent } from "antd";
import type { AppearanceSettingsDto } from "../lib/ipc/generated/AppearanceSettingsDto";
import type { CredentialStorageModeDto } from "../lib/ipc/generated/CredentialStorageModeDto";
import type { IpcTransport } from "../lib/ipc/transport";
import {
  IpcApplicationError,
  IpcTransportError,
  getAppearanceSettings,
  getCredentialStorageStatus,
  importKubeconfig,
  retryPersistentStorage,
  setAppearanceSettings,
  useSessionOnlyStorage,
} from "../lib/ipc/transport";
import { IpcContractError } from "../lib/ipc/validation";
import styles from "./PilotApp.module.css";
import { TalosProbePanel } from "./TalosProbePanel";

const DEFAULT_APPEARANCE: AppearanceSettingsDto = {
  theme: "system",
  density: "comfortable",
};

/** Provides the shell, backend-persisted appearance settings, and safe credential import. */
export function PilotApp({ transport }: { readonly transport?: IpcTransport }) {
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [storageMode, setStorageMode] = useState<CredentialStorageModeDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    if (transport === undefined) {
      return undefined;
    }
    let active = true;
    void (async () => {
      const settings = await getAppearanceSettings(transport);
      const storage = await getCredentialStorageStatus(transport);
      if (active) {
        setAppearance(settings);
        setStorageMode(storage.mode);
        setError(null);
      }
    })().catch((error: unknown) => {
      if (active) {
        const message =
          error instanceof IpcApplicationError
            ? error.message
            : error instanceof IpcContractError
              ? "The native application returned invalid settings data. Restart the application and try again."
              : error instanceof IpcTransportError
                ? "The native application could not load settings. Restart the application and try again."
                : "Desktop settings could not be loaded. Restart the application and try again.";
        setError(message);
      }
    });
    return () => {
      active = false;
    };
  }, [transport]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const dark = appearance.theme === "dark" || (appearance.theme === "system" && systemDark);
  const themeAlgorithms = useMemo(
    () => [
      dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      ...(appearance.density === "compact" ? [theme.compactAlgorithm] : []),
    ],
    [appearance.density, dark],
  );

  async function updateAppearance(next: AppearanceSettingsDto): Promise<void> {
    if (transport === undefined) {
      return;
    }
    setBusy(true);
    setAppearanceError(null);
    try {
      await setAppearanceSettings(transport, next);
      setAppearance(next);
    } catch {
      setAppearanceError(
        "Appearance settings could not be saved. Your previous settings remain active.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectSessionOnly(): Promise<void> {
    if (transport === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const status = await useSessionOnlyStorage(transport);
      setStorageMode(status.mode);
    } catch {
      setError("Session-only storage could not be started. No credentials were imported.");
    } finally {
      setBusy(false);
    }
  }

  async function retryVault(): Promise<void> {
    if (transport === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const status = await retryPersistentStorage(transport);
      setStorageMode(status.mode);
    } catch {
      setError("The operating system vault is still unavailable. Session data remains in memory.");
    } finally {
      setBusy(false);
    }
  }

  async function importCredential(): Promise<void> {
    if (transport === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await importKubeconfig(transport);
      if (result !== null) {
        setStorageMode(result.storage_mode);
        const persistence =
          result.storage_mode === "session_only" ? "for this session" : "encrypted";
        setNotice(`Imported context “${result.context_name}” ${persistence}.`);
      }
    } catch (error: unknown) {
      if (
        error instanceof IpcApplicationError &&
        error.detail.code === "CREDENTIAL_VAULT_UNAVAILABLE"
      ) {
        setStorageMode("vault_unavailable");
        setError(
          "The operating system vault is unavailable. Choose session-only storage or retry the vault.",
        );
      } else {
        setError("The kubeconfig could not be imported. Check its contents and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const unavailable = storageMode === "vault_unavailable";
  const canImport = transport !== undefined && storageMode !== null && !unavailable && !busy;

  return (
    <ConfigProvider
      theme={{
        algorithm: themeAlgorithms,
        token: {
          colorPrimary: "#1668dc",
          colorTextDescription: dark ? "#bfbfbf" : "#595959",
          borderRadius: 6,
          fontFamily: "system-ui, sans-serif",
        },
      }}
    >
      <App>
        <Layout className={styles.shell}>
          <Layout.Header className={styles.header}>
            <Typography.Title level={1} style={{ margin: 0, fontSize: 24 }}>
              Talos Pilot
            </Typography.Title>
            <section className={styles.preferences} aria-label="Appearance settings">
              <fieldset className={styles.preference}>
                <legend id="theme-label">Theme</legend>
                <Radio.Group
                  aria-labelledby="theme-label"
                  aria-describedby={appearanceError === null ? undefined : "appearance-error"}
                  disabled={transport === undefined || busy}
                  value={appearance.theme}
                  onChange={(event: RadioChangeEvent) => {
                    const value: unknown = event.target.value;
                    if (isAppearanceTheme(value)) {
                      void updateAppearance({ ...appearance, theme: value }).catch(() => {
                        setAppearanceError(
                          "Appearance settings could not be saved. Your previous settings remain active.",
                        );
                      });
                    }
                  }}
                  optionType="button"
                  options={[
                    { label: "System", value: "system" },
                    { label: "Light", value: "light" },
                    { label: "Dark", value: "dark" },
                  ]}
                />
              </fieldset>
              <fieldset className={styles.preference}>
                <legend id="density-label">Density</legend>
                <Radio.Group
                  aria-labelledby="density-label"
                  aria-describedby={appearanceError === null ? undefined : "appearance-error"}
                  disabled={transport === undefined || busy}
                  value={appearance.density}
                  onChange={(event: RadioChangeEvent) => {
                    const value: unknown = event.target.value;
                    if (isAppearanceDensity(value)) {
                      void updateAppearance({ ...appearance, density: value }).catch(() => {
                        setAppearanceError(
                          "Appearance settings could not be saved. Your previous settings remain active.",
                        );
                      });
                    }
                  }}
                  optionType="button"
                  options={[
                    { label: "Comfortable", value: "comfortable" },
                    { label: "Compact", value: "compact" },
                  ]}
                />
              </fieldset>
            </section>
            {appearanceError !== null && (
              <Alert
                id="appearance-error"
                role="alert"
                className={styles.actionMessage ?? ""}
                type="error"
                showIcon
                title={appearanceError}
              />
            )}
          </Layout.Header>
          <Layout.Content className={styles.content}>
            <Typography.Title level={2}>Clusters</Typography.Title>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No clusters connected" />
            <Typography.Paragraph
              style={{ textAlign: "center", maxWidth: 480, margin: "24px auto" }}
            >
              Workload and cluster management are under development. The read-only Talos probe below
              checks an authenticated API connection and status stream.
            </Typography.Paragraph>

            <TalosProbePanel transport={transport} />

            <section className={styles.credentials} aria-labelledby="credentials-title">
              <Typography.Title id="credentials-title" level={3}>
                Credentials
              </Typography.Title>
              {storageMode === "persistent" && (
                <Alert
                  type="success"
                  showIcon
                  title="Persistent storage uses the operating system credential vault."
                />
              )}
              {storageMode === "persistent_with_session_only" && (
                <Alert
                  type="warning"
                  showIcon
                  title="Persistent storage is active. Earlier session-only credentials remain in memory until exit."
                />
              )}
              {storageMode === "session_only" && (
                <Alert
                  type="warning"
                  showIcon
                  title="Session-only: credentials remain in memory until the application exits."
                />
              )}
              {storageMode === "vault_not_checked" && (
                <Typography.Paragraph>
                  Persistent encryption will use the operating system vault when you import a
                  kubeconfig.
                </Typography.Paragraph>
              )}
              {unavailable && (
                <Alert
                  type="warning"
                  showIcon
                  title="The operating system vault is unavailable. Choose session-only storage or retry the vault."
                />
              )}
              {storageMode === null && (
                <Typography.Paragraph>
                  Credential storage is available in the native desktop application.
                </Typography.Paragraph>
              )}
              <Space wrap>
                <Button
                  type="primary"
                  disabled={!canImport}
                  loading={busy}
                  aria-describedby={error === null ? undefined : "credential-action-error"}
                  onClick={() => void importCredential()}
                >
                  Import kubeconfig
                </Button>
                {unavailable && (
                  <Button
                    disabled={busy || transport === undefined}
                    onClick={() => void selectSessionOnly()}
                  >
                    Use session-only storage
                  </Button>
                )}
                {(storageMode === "session_only" || unavailable) && (
                  <Button
                    disabled={busy || transport === undefined}
                    onClick={() => void retryVault()}
                  >
                    Retry operating system vault
                  </Button>
                )}
              </Space>
              {error !== null && (
                <Alert
                  id="credential-action-error"
                  role="alert"
                  className={styles.actionMessage ?? ""}
                  type="error"
                  showIcon
                  title={error}
                />
              )}
              {notice !== null && (
                <Alert
                  className={styles.actionMessage ?? ""}
                  type="success"
                  showIcon
                  title={notice}
                />
              )}
            </section>
          </Layout.Content>
          <Layout.Footer className={styles.footer}>
            Foundation preview · Local desktop application
          </Layout.Footer>
        </Layout>
      </App>
    </ConfigProvider>
  );
}

function isAppearanceTheme(value: unknown): value is AppearanceSettingsDto["theme"] {
  return value === "system" || value === "light" || value === "dark";
}

function isAppearanceDensity(value: unknown): value is AppearanceSettingsDto["density"] {
  return value === "comfortable" || value === "compact";
}
