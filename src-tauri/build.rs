//! Generates the desktop resources and capability metadata from Tauri configuration.

fn main() {
    tauri_build::build();

    let generated = std::path::PathBuf::from(
        std::env::var_os("OUT_DIR").unwrap_or_else(|| panic!("Cargo did not set OUT_DIR")),
    );
    println!("cargo:rerun-if-changed=../proto/helper/v1/envelope.proto");
    prost_build::Config::new()
        .out_dir(&generated)
        .compile_protos(&["../proto/helper/v1/envelope.proto"], &["../proto"])
        .unwrap_or_else(|error| panic!("could not generate helper protocol types: {error}"));
}
