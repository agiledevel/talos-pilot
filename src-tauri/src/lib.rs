//! Native application contracts and desktop startup.

pub mod contracts;
pub mod helper;
pub mod kubernetes;
mod secret;
pub mod storage;
pub mod talos;

use std::{
    fs::File,
    io::Read,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
};

use secrecy::{ExposeSecret, SecretBox};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use zeroize::Zeroizing;

use contracts::{
    AppearanceDensity, AppearanceSettingsDto, AppearanceTheme, ApplicationErrorDto,
    CredentialImportResultDto, CredentialStorageModeDto, CredentialStorageStatusDto,
    HelperStatusDto, KubernetesCredentialSummaryDto, KubernetesPodDto, KubernetesPodListDto,
    KubernetesPodReadinessDto, KubernetesSessionDto, KubernetesVersionDto,
    TalosCredentialSessionDto, TalosProbeEventDto,
};
use helper::service::HelperService;
use kubernetes::{KubernetesError, KubernetesSessionStore};
use storage::{
    CredentialStorageMode, EncryptionError, KubeconfigError, StorageError, StorageRuntime,
    validate_kubeconfig,
};
use talos::{TalosConfigError, TalosSessionStore, read_talosconfig};

const MAX_IMPORT_FILE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Clone)]
struct AppStorage {
    runtime: Arc<Mutex<StorageRuntime>>,
    import_gate: Arc<tokio::sync::Mutex<()>>,
}

/// Reads the helper handshake status through the application's private process owner.
///
/// The command takes no renderer-controlled path or process arguments. Its
/// generated Tauri permission is granted only to the main window capability.
#[tauri::command]
async fn get_helper_status(
    app: tauri::AppHandle,
    service: tauri::State<'_, HelperService>,
) -> Result<HelperStatusDto, ApplicationErrorDto> {
    let executable = helper_executable(&app)?;
    service.status(&executable).await
}

/// Imports one mTLS talosconfig context through the native file picker.
#[tauri::command]
async fn import_talosconfig(
    app: tauri::AppHandle,
    sessions: State<'_, TalosSessionStore>,
) -> Result<Option<TalosCredentialSessionDto>, ApplicationErrorDto> {
    let Some(selected) = pick_talosconfig_file(&app).await? else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| talos_config_error("import_talosconfig", TalosConfigError::Invalid))?;
    let config =
        read_talosconfig(&path).map_err(|error| talos_config_error("import_talosconfig", error))?;
    sessions
        .insert(config)
        .map(Some)
        .map_err(|error| talos_config_error("import_talosconfig", error))
}

/// Starts a bounded authenticated Talos read and forwards typed native events.
#[tauri::command]
async fn start_talos_probe(
    app: tauri::AppHandle,
    service: State<'_, HelperService>,
    sessions: State<'_, TalosSessionStore>,
    session_id: String,
    node: String,
    channel: tauri::ipc::Channel<TalosProbeEventDto>,
) -> Result<(), ApplicationErrorDto> {
    let input = sessions
        .probe_input(&session_id, &node)
        .map_err(|error| talos_config_error("start_talos_probe", error))?;
    let executable = helper_executable(&app)?;
    service
        .talos_probe(
            &executable,
            input.config,
            input.endpoints,
            input.node,
            input.session_id,
            move |event| channel.send(event).map_err(|_| ()),
        )
        .await
}

/// Cancels the Talos status stream owned by one backend session.
#[tauri::command]
fn stop_talos_probe(
    service: State<'_, HelperService>,
    session_id: String,
) -> Result<bool, ApplicationErrorDto> {
    Ok(service.stop_talos_probe(&session_id))
}

/// Removes a session-only Talos credential and stops its current probe.
#[tauri::command]
fn close_talos_session(
    service: State<'_, HelperService>,
    sessions: State<'_, TalosSessionStore>,
    session_id: String,
) -> Result<bool, ApplicationErrorDto> {
    let _ = service.stop_talos_probe(&session_id);
    sessions
        .remove(&session_id)
        .map_err(|error| talos_config_error("close_talos_session", error))
}

fn helper_executable(app: &tauri::AppHandle) -> Result<PathBuf, ApplicationErrorDto> {
    #[cfg(target_os = "windows")]
    let file_name = "talos-pilot-helper.exe";
    #[cfg(not(target_os = "windows"))]
    let file_name = "talos-pilot-helper";

    let directory = if cfg!(debug_assertions) || cfg!(feature = "native-test") {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries")
    } else {
        app.path()
            .resource_dir()
            .map_err(|_| helper_path_error())?
            .join("binaries")
    };
    Ok(directory.join(file_name))
}

fn helper_path_error() -> ApplicationErrorDto {
    ApplicationErrorDto {
        code: "HELPER_UNAVAILABLE".to_owned(),
        action: "get_helper_status".to_owned(),
        target: None,
        retryable: false,
        message: "The bundled helper is unavailable. Restart the application and try again."
            .to_owned(),
    }
}

/// Runs storage work on the blocking pool with the runtime lock held.
///
/// Storage commands touch SQLite and may wait on the operating-system vault, so
/// they must never run on the main thread (where Tauri executes non-`async`
/// commands) or on an async worker. A panicked or cancelled task is reported
/// as the retryable `STORAGE_UNAVAILABLE` error for `action`.
async fn run_storage<T, F>(
    runtime: Arc<Mutex<StorageRuntime>>,
    action: &'static str,
    work: F,
) -> Result<T, ApplicationErrorDto>
where
    T: Send + 'static,
    F: FnOnce(&mut StorageRuntime) -> Result<T, ApplicationErrorDto> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let mut storage = lock_storage(&runtime, action)?;
        work(&mut storage)
    })
    .await
    .map_err(|_| {
        application_error(
            "STORAGE_UNAVAILABLE",
            action,
            "Local storage is unavailable.",
            true,
        )
    })?
}

#[tauri::command]
async fn get_appearance_settings(
    storage: State<'_, AppStorage>,
) -> Result<AppearanceSettingsDto, ApplicationErrorDto> {
    run_storage(
        Arc::clone(&storage.runtime),
        "get_appearance_settings",
        |storage| {
            let theme = storage
                .preference("appearance-theme")
                .map_err(|error| storage_error("get_appearance_settings", error))?;
            let density = storage
                .preference("appearance-density")
                .map_err(|error| storage_error("get_appearance_settings", error))?;
            let theme = match theme.as_deref().unwrap_or("system") {
                "system" => AppearanceTheme::System,
                "light" => AppearanceTheme::Light,
                "dark" => AppearanceTheme::Dark,
                _ => {
                    return Err(storage_error(
                        "get_appearance_settings",
                        StorageError::InvalidMetadata,
                    ));
                }
            };
            let density = match density.as_deref().unwrap_or("comfortable") {
                "comfortable" => AppearanceDensity::Comfortable,
                "compact" => AppearanceDensity::Compact,
                _ => {
                    return Err(storage_error(
                        "get_appearance_settings",
                        StorageError::InvalidMetadata,
                    ));
                }
            };
            Ok(AppearanceSettingsDto { theme, density })
        },
    )
    .await
}

#[tauri::command]
async fn set_appearance_settings(
    storage: State<'_, AppStorage>,
    settings: AppearanceSettingsDto,
) -> Result<(), ApplicationErrorDto> {
    run_storage(
        Arc::clone(&storage.runtime),
        "set_appearance_settings",
        move |storage| {
            let theme = match settings.theme {
                AppearanceTheme::System => "system",
                AppearanceTheme::Light => "light",
                AppearanceTheme::Dark => "dark",
            };
            let density = match settings.density {
                AppearanceDensity::Comfortable => "comfortable",
                AppearanceDensity::Compact => "compact",
            };
            storage
                .set_appearance_preferences(theme, density)
                .map_err(|error| storage_error("set_appearance_settings", error))
        },
    )
    .await
}

#[tauri::command]
async fn get_credential_storage_status(
    storage: State<'_, AppStorage>,
) -> Result<CredentialStorageStatusDto, ApplicationErrorDto> {
    run_storage(
        Arc::clone(&storage.runtime),
        "get_credential_storage_status",
        |storage| {
            Ok(CredentialStorageStatusDto {
                mode: credential_mode_dto(storage.credential_mode()),
            })
        },
    )
    .await
}

#[tauri::command]
async fn use_session_only_storage(
    storage: State<'_, AppStorage>,
) -> Result<CredentialStorageStatusDto, ApplicationErrorDto> {
    run_storage(
        Arc::clone(&storage.runtime),
        "use_session_only_storage",
        |storage| {
            storage
                .use_session_only()
                .map_err(|error| storage_error("use_session_only_storage", error))?;
            Ok(CredentialStorageStatusDto {
                mode: credential_mode_dto(storage.credential_mode()),
            })
        },
    )
    .await
}

#[tauri::command]
async fn retry_persistent_storage(
    storage: State<'_, AppStorage>,
) -> Result<CredentialStorageStatusDto, ApplicationErrorDto> {
    run_storage(
        Arc::clone(&storage.runtime),
        "retry_persistent_storage",
        |storage| {
            storage
                .retry_persistent()
                .map_err(|error| storage_error("retry_persistent_storage", error))?;
            Ok(CredentialStorageStatusDto {
                mode: credential_mode_dto(storage.credential_mode()),
            })
        },
    )
    .await
}

#[tauri::command]
async fn import_kubeconfig(
    app: tauri::AppHandle,
    storage: State<'_, AppStorage>,
) -> Result<Option<CredentialImportResultDto>, ApplicationErrorDto> {
    let _import_guard = Arc::clone(&storage.import_gate)
        .try_lock_owned()
        .map_err(|_| {
            application_error(
                "IMPORT_IN_PROGRESS",
                "import_kubeconfig",
                "Another credential import is already in progress.",
                true,
            )
        })?;
    let selected = pick_kubeconfig_file(&app).await?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|_| {
        application_error(
            "IMPORT_UNAVAILABLE",
            "import_kubeconfig",
            "The selected file could not be opened.",
            false,
        )
    })?;
    let storage = Arc::clone(&storage.runtime);
    tauri::async_runtime::spawn_blocking(move || {
        let source =
            read_selected_file(&path).map_err(|error| import_error("import_kubeconfig", error))?;
        let metadata = validate_kubeconfig(source.expose_secret())
            .map_err(|error| kubeconfig_error("import_kubeconfig", error))?;
        let mut storage = lock_storage(&storage, "import_kubeconfig")?;
        let stored = storage
            .store_kubeconfig(&metadata, source)
            .map_err(|error| storage_error("import_kubeconfig", error))?;
        Ok(Some(CredentialImportResultDto {
            credential_handle: stored.handle,
            context_name: stored.context_label,
            storage_mode: credential_mode_dto(stored.storage_mode),
        }))
    })
    .await
    .map_err(|_| {
        application_error(
            "IMPORT_UNAVAILABLE",
            "import_kubeconfig",
            "The selected file could not be imported.",
            false,
        )
    })?
}

/// Lists stored Kubernetes credentials for an explicit user action.
///
/// The listing is never produced at startup: opening the shell must not read
/// the credential vault or create a key. Each entry carries an opaque handle
/// and a label derived from that credential's encrypted material.
#[tauri::command]
async fn list_kubernetes_credentials(
    storage: State<'_, AppStorage>,
) -> Result<Vec<KubernetesCredentialSummaryDto>, ApplicationErrorDto> {
    run_storage(
        Arc::clone(&storage.runtime),
        "list_kubernetes_credentials",
        |storage| {
            let summaries = storage
                .list_kubeconfig_credentials()
                .map_err(|error| storage_error("list_kubernetes_credentials", error))?;
            Ok(summaries
                .into_iter()
                .map(|summary| KubernetesCredentialSummaryDto {
                    credential_handle: summary.handle,
                    context_label: summary.context_label,
                    storage_mode: credential_mode_dto(summary.storage_mode),
                })
                .collect())
        },
    )
    .await
}

/// Opens a Kubernetes session for one credential handle.
///
/// The handle is resolved inside the storage lock, which is released before the
/// client is constructed, so no database lock is ever held across network I/O.
/// The session carries the client; only its bounded identity crosses IPC.
#[tauri::command]
async fn open_kubernetes_session(
    storage: State<'_, AppStorage>,
    sessions: State<'_, KubernetesSessionStore>,
    credential_handle: String,
) -> Result<KubernetesSessionDto, ApplicationErrorDto> {
    let resolved = run_storage(
        Arc::clone(&storage.runtime),
        "open_kubernetes_session",
        move |storage| {
            storage
                .resolve_kubeconfig_credential(&credential_handle)
                .map_err(|error| storage_error("open_kubernetes_session", error))
        },
    )
    .await?;
    let session = sessions
        .open(&resolved)
        .map_err(|error| kubernetes_error("open_kubernetes_session", error))?;
    Ok(KubernetesSessionDto {
        session_id: session.session_id,
        context_label: session.context_label,
        storage_mode: credential_mode_dto(session.storage_mode),
    })
}

/// Closes one Kubernetes session and releases its client.
#[tauri::command]
fn close_kubernetes_session(
    sessions: State<'_, KubernetesSessionStore>,
    session_id: String,
) -> Result<bool, ApplicationErrorDto> {
    sessions
        .close(&session_id)
        .map_err(|error| kubernetes_error("close_kubernetes_session", error))
}

/// Reads the API server version through an opened session.
///
/// This is a nonsensitive discovery read. It is bounded by the adapter's
/// admission capacity and per-attempt deadline, and it returns only the
/// reported version fields.
#[tauri::command]
async fn read_kubernetes_version(
    sessions: State<'_, KubernetesSessionStore>,
    session_id: String,
) -> Result<KubernetesVersionDto, ApplicationErrorDto> {
    let version = sessions
        .apiserver_version(&session_id)
        .await
        .map_err(|error| kubernetes_error("read_kubernetes_version", error))?;
    Ok(KubernetesVersionDto {
        session_id,
        version: version.version,
        major: version.major,
        minor: version.minor,
    })
}

/// Reads bounded Pod summaries for one session and namespace.
///
/// Server continuation tokens remain inside the Kubernetes adapter. The
/// response contains only allowlisted metadata and an explicit completeness
/// flag when an aggregate retention bound stops collection.
#[tauri::command]
async fn list_kubernetes_pods(
    sessions: State<'_, KubernetesSessionStore>,
    session_id: String,
    namespace: String,
    label_selector: Option<String>,
    field_selector: Option<String>,
) -> Result<KubernetesPodListDto, ApplicationErrorDto> {
    let snapshot = sessions
        .list_pods(
            &session_id,
            &namespace,
            label_selector.as_deref(),
            field_selector.as_deref(),
        )
        .await
        .map_err(|error| kubernetes_error("list_kubernetes_pods", error))?;
    let items = snapshot
        .items
        .into_iter()
        .map(|pod| KubernetesPodDto {
            name: pod.name,
            namespace: pod.namespace,
            uid: pod.uid,
            resource_version: pod.resource_version,
            phase: pod.phase,
            readiness: match pod.ready {
                kubernetes::ReadySummary::Ready => KubernetesPodReadinessDto::Ready,
                kubernetes::ReadySummary::NotReady => KubernetesPodReadinessDto::NotReady,
                kubernetes::ReadySummary::Unknown => KubernetesPodReadinessDto::Unknown,
            },
        })
        .collect();
    Ok(KubernetesPodListDto {
        session_id,
        namespace,
        resource_version: snapshot.resource_version,
        complete: snapshot.complete,
        items,
    })
}

async fn pick_kubeconfig_file(
    app: &tauri::AppHandle,
) -> Result<Option<tauri_plugin_dialog::FilePath>, ApplicationErrorDto> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Kubeconfig YAML", &["yaml", "yml", "conf"])
        .pick_file(move |selected| {
            if let Err(unclaimed_path) = sender.send(selected) {
                drop(unclaimed_path);
            }
        });
    receiver.await.map_err(|_| {
        application_error(
            "IMPORT_UNAVAILABLE",
            "import_kubeconfig",
            "The native file dialog could not be completed.",
            true,
        )
    })
}

async fn pick_talosconfig_file(
    app: &tauri::AppHandle,
) -> Result<Option<tauri_plugin_dialog::FilePath>, ApplicationErrorDto> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Talos config", &["yaml", "yml"])
        .pick_file(move |selected| {
            if let Err(unclaimed_path) = sender.send(selected) {
                drop(unclaimed_path);
            }
        });
    receiver.await.map_err(|_| {
        application_error(
            "IMPORT_UNAVAILABLE",
            "import_talosconfig",
            "The native file dialog could not be completed.",
            true,
        )
    })
}

fn lock_storage<'a>(
    storage: &'a Mutex<StorageRuntime>,
    action: &str,
) -> Result<MutexGuard<'a, StorageRuntime>, ApplicationErrorDto> {
    storage.lock().map_err(|_| {
        application_error(
            "STORAGE_UNAVAILABLE",
            action,
            "Local storage is unavailable.",
            true,
        )
    })
}

fn credential_mode_dto(mode: CredentialStorageMode) -> CredentialStorageModeDto {
    match mode {
        CredentialStorageMode::VaultNotChecked => CredentialStorageModeDto::VaultNotChecked,
        CredentialStorageMode::Persistent => CredentialStorageModeDto::Persistent,
        CredentialStorageMode::PersistentWithSessionOnly => {
            CredentialStorageModeDto::PersistentWithSessionOnly
        }
        CredentialStorageMode::VaultUnavailable => CredentialStorageModeDto::VaultUnavailable,
        CredentialStorageMode::SessionOnly => CredentialStorageModeDto::SessionOnly,
    }
}

fn storage_error(action: &str, error: StorageError) -> ApplicationErrorDto {
    match error {
        StorageError::Vault(_) => application_error(
            "CREDENTIAL_VAULT_UNAVAILABLE",
            action,
            "The operating system credential vault is unavailable. Choose session-only storage or retry later.",
            true,
        ),
        StorageError::InvalidMode => application_error(
            "STORAGE_MODE_INVALID",
            action,
            "That credential storage choice is not available now.",
            false,
        ),
        StorageError::Encryption(EncryptionError::TooLarge) => application_error(
            "STORAGE_LIMIT_EXCEEDED",
            action,
            "The selected credential exceeds the supported size.",
            false,
        ),
        StorageError::Filesystem(_)
        | StorageError::Database(_)
        | StorageError::UnsupportedSchema => application_error(
            "STORAGE_UNAVAILABLE",
            action,
            "Local storage is unavailable. Restart the application and try again.",
            true,
        ),
        StorageError::InvalidMetadata
        | StorageError::MissingValue
        | StorageError::Encryption(_) => application_error(
            "STORAGE_INVALID",
            action,
            "The storage request could not be completed.",
            false,
        ),
        StorageError::UnknownCredential => application_error(
            "KUBERNETES_CREDENTIAL_UNKNOWN",
            action,
            "The selected Kubernetes credential is no longer available. Import it again.",
            false,
        ),
    }
}

/// Maps one Kubernetes adapter failure onto a stable application error.
///
/// The adapter's categories are already redacted: no SDK message, credential,
/// or cluster response reaches this function, and none is forwarded.
fn kubernetes_error(action: &str, error: KubernetesError) -> ApplicationErrorDto {
    let (code, message, retryable) = match error {
        KubernetesError::CredentialInvalid => (
            "KUBERNETES_CREDENTIAL_INVALID",
            "The stored credential is not a supported kubeconfig.",
            false,
        ),
        KubernetesError::InvalidQuery => (
            "KUBERNETES_QUERY_INVALID",
            "The Kubernetes namespace or selector is invalid or too large.",
            false,
        ),
        KubernetesError::SessionLimit => (
            "KUBERNETES_SESSION_LIMIT",
            "Close a Kubernetes session before opening another.",
            false,
        ),
        KubernetesError::SessionUnknown => (
            "KUBERNETES_SESSION_UNKNOWN",
            "The Kubernetes session is no longer open.",
            false,
        ),
        KubernetesError::CapacityExceeded => (
            "KUBERNETES_CAPACITY_EXCEEDED",
            "The application is already running its maximum number of Kubernetes requests.",
            true,
        ),
        KubernetesError::Unauthorized => (
            "KUBERNETES_UNAUTHORIZED",
            "The Kubernetes API server rejected the credential.",
            false,
        ),
        KubernetesError::Forbidden => (
            "KUBERNETES_FORBIDDEN",
            "The Kubernetes API server denied the request for this credential.",
            false,
        ),
        KubernetesError::ApiNotFound => (
            "KUBERNETES_API_UNSUPPORTED",
            "This Kubernetes API server does not provide the Pod list API.",
            false,
        ),
        KubernetesError::NamespaceNotFound => (
            "KUBERNETES_NAMESPACE_NOT_FOUND",
            "The selected Kubernetes namespace does not exist.",
            false,
        ),
        KubernetesError::ContinuationExpired => (
            "KUBERNETES_CONTINUATION_EXPIRED",
            "The Kubernetes list expired. Start a new list to avoid mixing snapshots.",
            false,
        ),
        KubernetesError::CertificateInvalid => (
            "KUBERNETES_CERTIFICATE_INVALID",
            "Kubernetes TLS validation failed for the configured cluster certificate authority.",
            false,
        ),
        KubernetesError::Unavailable => (
            "KUBERNETES_UNAVAILABLE",
            "The Kubernetes API server is unavailable.",
            true,
        ),
        KubernetesError::UnsupportedResponse => (
            "KUBERNETES_RESPONSE_INVALID",
            "The Kubernetes API server returned an unsupported response.",
            false,
        ),
        KubernetesError::ClientUnavailable => (
            "KUBERNETES_CLIENT_UNAVAILABLE",
            "The Kubernetes client could not be created for the selected credential.",
            false,
        ),
        KubernetesError::RegistryUnavailable => (
            "KUBERNETES_SESSION_UNAVAILABLE",
            "Kubernetes session state is unavailable. Restart the application and try again.",
            false,
        ),
    };
    application_error(code, action, message, retryable)
}

fn kubeconfig_error(action: &str, error: KubeconfigError) -> ApplicationErrorDto {
    let (code, message) = match error {
        KubeconfigError::TooLarge => (
            "IMPORT_LIMIT_EXCEEDED",
            "The selected file exceeds the 4 MiB import limit.",
        ),
        KubeconfigError::ExecAuthentication => (
            "IMPORT_EXEC_AUTH_UNSUPPORTED",
            "Kubeconfig exec authentication is not supported.",
        ),
        KubeconfigError::AuthProvider => (
            "IMPORT_AUTH_PROVIDER_UNSUPPORTED",
            "Kubeconfig auth-provider authentication is not supported.",
        ),
        KubeconfigError::ExternalFileReference => (
            "IMPORT_EXTERNAL_FILE_UNSUPPORTED",
            "Kubeconfig file references must contain inline credential data.",
        ),
        KubeconfigError::InvalidEndpoint => (
            "IMPORT_ENDPOINT_INVALID",
            "The kubeconfig must use a valid TLS cluster endpoint.",
        ),
        KubeconfigError::MissingCredentials => (
            "IMPORT_CREDENTIALS_MISSING",
            "The selected kubeconfig context has no supported inline credentials.",
        ),
        KubeconfigError::InvalidDocument => (
            "IMPORT_KUBECONFIG_INVALID",
            "The selected file is not a supported kubeconfig.",
        ),
    };
    application_error(code, action, message, false)
}

fn talos_config_error(action: &str, error: TalosConfigError) -> ApplicationErrorDto {
    let (code, message) = match error {
        TalosConfigError::TooLarge => (
            "TALOS_CONFIG_LIMIT_EXCEEDED",
            "The talosconfig exceeds the 64 KiB session import limit.",
        ),
        TalosConfigError::UnsupportedAuthentication => (
            "TALOS_AUTH_UNSUPPORTED",
            "Talos probes require a selected context with inline mTLS credentials and no proxy or alternate auth provider.",
        ),
        TalosConfigError::SessionLimit => (
            "TALOS_SESSION_LIMIT",
            "Close an existing Talos session before importing another context.",
        ),
        TalosConfigError::UnknownTarget => (
            "TALOS_TARGET_INVALID",
            "The selected Talos session or node target is unavailable.",
        ),
        TalosConfigError::Invalid => (
            "TALOS_CONFIG_INVALID",
            "The selected file does not contain a supported Talos mTLS context.",
        ),
        TalosConfigError::Unavailable => (
            "TALOS_SESSION_UNAVAILABLE",
            "The in-memory Talos session could not be accessed.",
        ),
    };
    application_error(code, action, message, false)
}

fn import_error(action: &str, error: std::io::Error) -> ApplicationErrorDto {
    if error.kind() == std::io::ErrorKind::FileTooLarge {
        application_error(
            "IMPORT_LIMIT_EXCEEDED",
            action,
            "The selected file exceeds the 4 MiB import limit.",
            false,
        )
    } else {
        application_error(
            "IMPORT_FILE_UNAVAILABLE",
            action,
            "The selected file could not be read.",
            false,
        )
    }
}

fn application_error(
    code: &str,
    action: &str,
    message: &str,
    retryable: bool,
) -> ApplicationErrorDto {
    ApplicationErrorDto {
        code: code.to_owned(),
        action: action.to_owned(),
        target: None,
        retryable,
        message: message.to_owned(),
    }
}

fn read_selected_file(path: &std::path::Path) -> Result<SecretBox<[u8]>, std::io::Error> {
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(std::io::Error::from(std::io::ErrorKind::InvalidInput));
    }
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err(std::io::Error::from(std::io::ErrorKind::FileTooLarge));
    }
    let mut bytes = Zeroizing::new(Vec::with_capacity(metadata.len() as usize));
    file.take(MAX_IMPORT_FILE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_IMPORT_FILE_BYTES {
        return Err(std::io::Error::from(std::io::ErrorKind::FileTooLarge));
    }
    Ok(SecretBox::new(
        std::mem::take(&mut *bytes).into_boxed_slice(),
    ))
}

/// Starts the Tauri desktop application.
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(HelperService::default())
        .manage(TalosSessionStore::default())
        .manage(KubernetesSessionStore::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let storage = open_storage_runtime(app.handle())?;
            app.manage(AppStorage {
                runtime: Arc::new(Mutex::new(storage)),
                import_gate: Arc::new(tokio::sync::Mutex::new(())),
            });
            #[cfg(feature = "native-test")]
            {
                use tauri::{WebviewUrl, WebviewWindowBuilder};

                WebviewWindowBuilder::new(
                    app,
                    "unauthorized",
                    WebviewUrl::App("index.html#native-test-unauthorized".into()),
                )
                .title("Talos Pilot native IPC permission test")
                .build()?;
            }
            Ok(())
        });
    #[cfg(feature = "native-test")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
    let application = builder
        .invoke_handler(tauri::generate_handler![
            get_helper_status,
            get_appearance_settings,
            set_appearance_settings,
            get_credential_storage_status,
            use_session_only_storage,
            retry_persistent_storage,
            import_kubeconfig,
            import_talosconfig,
            list_kubernetes_credentials,
            open_kubernetes_session,
            close_kubernetes_session,
            read_kubernetes_version,
            list_kubernetes_pods,
            start_talos_probe,
            stop_talos_probe,
            close_talos_session
        ])
        .build(tauri::generate_context!());
    match application {
        Ok(application) => application.run(|handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                let service = handle.state::<HelperService>();
                tauri::async_runtime::block_on(service.shutdown());
            }
        }),
        Err(_) => {
            eprintln!("Talos Pilot could not start because its desktop configuration is invalid.");
            std::process::exit(1);
        }
    }
}

#[cfg(feature = "native-test")]
fn open_storage_runtime(_app: &tauri::AppHandle) -> Result<StorageRuntime, StorageError> {
    let mut runtime = StorageRuntime::open_native_test()?;
    seed_native_test_kubernetes_credential(&mut runtime)?;
    Ok(runtime)
}

/// Imports the synthetic Kubernetes credential a native-test run injects.
///
/// The native suite needs one imported credential to exercise the credential
/// and session boundary without a picker or a cluster. When
/// `TALOS_PILOT_NATIVE_TEST_KUBERNETES_DIR` names a directory holding a
/// `kubeconfig.yaml`, that file is read through the same bounded bytes, the
/// same validation, and the same store path a user import uses; nothing about
/// it is special except that the harness supplied the file.
///
/// Only the `native-test` feature compiles this function, so a production
/// artifact cannot read the variable, and the native-test runtime stores the
/// credential in its isolated session-only memory rather than in any database.
///
/// # Errors
///
/// Returns a safe storage error when an injected file is unreadable or does not
/// validate as a supported kubeconfig.
#[cfg(feature = "native-test")]
fn seed_native_test_kubernetes_credential(
    runtime: &mut StorageRuntime,
) -> Result<(), StorageError> {
    let Ok(directory) = std::env::var("TALOS_PILOT_NATIVE_TEST_KUBERNETES_DIR") else {
        return Ok(());
    };
    if directory.is_empty() {
        return Ok(());
    }
    let path = std::path::PathBuf::from(directory).join("kubeconfig.yaml");
    if !path.is_file() {
        return Ok(());
    }

    let bytes = std::fs::read(&path)?;
    if bytes.len() as u64 > MAX_IMPORT_FILE_BYTES {
        return Err(StorageError::InvalidMetadata);
    }
    let source = SecretBox::new(bytes.into_boxed_slice());
    let metadata =
        validate_kubeconfig(source.expose_secret()).map_err(|_| StorageError::InvalidMetadata)?;
    drop(runtime.store_kubeconfig(&metadata, source)?);
    Ok(())
}

#[cfg(not(feature = "native-test"))]
fn open_storage_runtime(app: &tauri::AppHandle) -> Result<StorageRuntime, StorageError> {
    let directory = app.path().app_data_dir().map_err(|_| {
        StorageError::Filesystem(std::io::Error::other(
            "application data directory unavailable",
        ))
    })?;
    StorageRuntime::open(&directory)
}

#[cfg(test)]
mod kubernetes_error_tests {
    use super::kubernetes_error;
    use crate::kubernetes::KubernetesError;

    #[test]
    fn list_terminal_outcomes_have_distinct_redacted_application_codes() {
        let cases = [
            (KubernetesError::Unauthorized, "KUBERNETES_UNAUTHORIZED"),
            (KubernetesError::Forbidden, "KUBERNETES_FORBIDDEN"),
            (KubernetesError::ApiNotFound, "KUBERNETES_API_UNSUPPORTED"),
            (
                KubernetesError::NamespaceNotFound,
                "KUBERNETES_NAMESPACE_NOT_FOUND",
            ),
            (
                KubernetesError::ContinuationExpired,
                "KUBERNETES_CONTINUATION_EXPIRED",
            ),
            (
                KubernetesError::CertificateInvalid,
                "KUBERNETES_CERTIFICATE_INVALID",
            ),
        ];
        let mut observed = std::collections::BTreeSet::new();
        for (error, expected_code) in cases {
            let projected = kubernetes_error("list_kubernetes_pods", error);
            assert_eq!(projected.code, expected_code);
            assert_eq!(projected.action, "list_kubernetes_pods");
            assert!(!projected.retryable);
            assert!(observed.insert(projected.code));
        }
    }
}
