//! Native application contracts and desktop startup.

pub mod contracts;
pub mod helper;

use std::path::PathBuf;

use tauri::Manager;

use contracts::{ApplicationErrorDto, HelperStatusDto};
use helper::service::HelperService;

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

fn helper_executable(app: &tauri::AppHandle) -> Result<PathBuf, ApplicationErrorDto> {
    #[cfg(target_os = "windows")]
    let file_name = "talos-pilot-helper.exe";
    #[cfg(not(target_os = "windows"))]
    let file_name = "talos-pilot-helper";

    let directory = if cfg!(debug_assertions) {
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

/// Starts the Tauri desktop application.
pub fn run() {
    let application = tauri::Builder::default()
        .manage(HelperService::default())
        .invoke_handler(tauri::generate_handler![get_helper_status])
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
