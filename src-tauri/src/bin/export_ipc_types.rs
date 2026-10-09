//! Exports application IPC declarations from the authoritative Rust DTOs.

use std::{env, fs, path::PathBuf};

use talos_pilot::contracts::{
    AppearanceDensity, AppearanceSettingsDto, AppearanceTheme, ApplicationErrorDto,
    CredentialImportResultDto, CredentialStorageModeDto, CredentialStorageStatusDto,
    HelperCapability, HelperState, HelperStatusDto, TalosCredentialSessionDto, TalosProbeEventDto,
    TalosProbeState,
};
use ts_rs::{Config, TS};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args().skip(1);
    if arguments.next().as_deref() != Some("--output-dir") {
        return Err("expected --output-dir <path>".into());
    }
    let output = PathBuf::from(arguments.next().ok_or("missing output directory")?);
    fs::create_dir_all(&output)?;
    for entry in fs::read_dir(&output)? {
        let path = entry?.path();
        if path.extension().is_some_and(|extension| extension == "ts") {
            fs::remove_file(path)?;
        }
    }

    let config = Config::new().with_out_dir(&output);
    for result in [
        HelperState::export_all(&config),
        HelperCapability::export_all(&config),
        HelperStatusDto::export_all(&config),
        ApplicationErrorDto::export_all(&config),
        AppearanceTheme::export_all(&config),
        AppearanceDensity::export_all(&config),
        AppearanceSettingsDto::export_all(&config),
        CredentialStorageModeDto::export_all(&config),
        CredentialStorageStatusDto::export_all(&config),
        CredentialImportResultDto::export_all(&config),
        TalosProbeState::export_all(&config),
        TalosProbeEventDto::export_all(&config),
        TalosCredentialSessionDto::export_all(&config),
    ] {
        result?;
    }

    for entry in fs::read_dir(&output)? {
        let source = entry?.path();
        if source.extension().is_none_or(|extension| extension != "ts") {
            continue;
        }
        let contents = fs::read(&source)?;
        let mut generated =
            b"// Generated from src-tauri/src/contracts.rs. Do not edit.\n".to_vec();
        generated.extend(contents);
        fs::write(&source, generated)?;
    }

    Ok(())
}
