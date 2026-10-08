//! Generates the desktop resources and capability metadata from Tauri configuration.

fn main() {
    std::fs::create_dir_all("binaries")
        .unwrap_or_else(|error| panic!("could not prepare helper resource directory: {error}"));
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_helper_status",
            "get_appearance_settings",
            "set_appearance_settings",
            "get_credential_storage_status",
            "use_session_only_storage",
            "retry_persistent_storage",
            "import_kubeconfig",
        ]));
    tauri_build::try_build(attributes)
        .unwrap_or_else(|error| panic!("could not generate Tauri capabilities: {error}"));

    let build_identity = std::fs::read_to_string("helper-build-id.txt")
        .ok()
        .or_else(|| std::env::var("TALOS_PILOT_BUILD_ID").ok())
        .or_else(|| std::env::var("GITHUB_SHA").ok())
        .filter(|value| !value.is_empty())
        .map(|value| value.trim().to_owned())
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_owned());
    println!("cargo:rustc-env=TALOS_PILOT_BUILD_ID={build_identity}");
    println!("cargo:rerun-if-changed=helper-build-id.txt");
    println!("cargo:rerun-if-env-changed=TALOS_PILOT_BUILD_ID");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");

    let generated = std::path::PathBuf::from(
        std::env::var_os("OUT_DIR").unwrap_or_else(|| panic!("Cargo did not set OUT_DIR")),
    );
    println!("cargo:rerun-if-changed=../proto/helper/v1/envelope.proto");
    prost_build::Config::new()
        .out_dir(&generated)
        .compile_protos(&["../proto/helper/v1/envelope.proto"], &["../proto"])
        .unwrap_or_else(|error| panic!("could not generate helper protocol types: {error}"));
}
