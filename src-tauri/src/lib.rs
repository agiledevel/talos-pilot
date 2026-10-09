//! Native application contracts and desktop startup.

pub mod contracts;
pub mod helper;
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
    HelperStatusDto, TalosCredentialSessionDto, TalosProbeEventDto,
};
use helper::service::HelperService;
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

#[tauri::command]
fn get_appearance_settings(
    storage: State<'_, AppStorage>,
) -> Result<AppearanceSettingsDto, ApplicationErrorDto> {
    let storage = lock_storage(&storage.runtime, "get_appearance_settings")?;
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
}

#[tauri::command]
fn set_appearance_settings(
    storage: State<'_, AppStorage>,
    settings: AppearanceSettingsDto,
) -> Result<(), ApplicationErrorDto> {
    let mut storage = lock_storage(&storage.runtime, "set_appearance_settings")?;
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
}

#[tauri::command]
fn get_credential_storage_status(
    storage: State<'_, AppStorage>,
) -> Result<CredentialStorageStatusDto, ApplicationErrorDto> {
    let storage = lock_storage(&storage.runtime, "get_credential_storage_status")?;
    Ok(CredentialStorageStatusDto {
        mode: credential_mode_dto(storage.credential_mode()),
    })
}

#[tauri::command]
fn use_session_only_storage(
    storage: State<'_, AppStorage>,
) -> Result<CredentialStorageStatusDto, ApplicationErrorDto> {
    let mut storage = lock_storage(&storage.runtime, "use_session_only_storage")?;
    storage
        .use_session_only()
        .map_err(|error| storage_error("use_session_only_storage", error))?;
    Ok(CredentialStorageStatusDto {
        mode: credential_mode_dto(storage.credential_mode()),
    })
}

#[tauri::command]
async fn retry_persistent_storage(
    storage: State<'_, AppStorage>,
) -> Result<CredentialStorageStatusDto, ApplicationErrorDto> {
    let storage = Arc::clone(&storage.runtime);
    tauri::async_runtime::spawn_blocking(move || {
        let mut storage = lock_storage(&storage, "retry_persistent_storage")?;
        storage
            .retry_persistent()
            .map_err(|error| storage_error("retry_persistent_storage", error))?;
        Ok(CredentialStorageStatusDto {
            mode: credential_mode_dto(storage.credential_mode()),
        })
    })
    .await
    .map_err(|_| {
        application_error(
            "STORAGE_UNAVAILABLE",
            "retry_persistent_storage",
            "Persistent storage could not be retried.",
            true,
        )
    })?
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
        let mode = storage
            .store_kubeconfig(&metadata, source)
            .map_err(|error| storage_error("import_kubeconfig", error))?;
        Ok(Some(CredentialImportResultDto {
            context_name: metadata.context_name,
            storage_mode: credential_mode_dto(mode),
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
    }
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
    StorageRuntime::open_native_test()
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
