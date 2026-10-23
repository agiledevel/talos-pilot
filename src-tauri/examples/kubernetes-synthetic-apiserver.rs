//! Runs the synthetic Kubernetes API server used by the native test harness.
//!
//! The native suite needs a real TLS peer to exercise the product's client path
//! without a cluster. This example serves exactly that: it generates an
//! ephemeral certificate authority and server certificate, writes a synthetic
//! kubeconfig into the directory named on the command line, prints
//! `READY <endpoint>` on standard output once it is listening, and then serves
//! until the harness terminates it.
//!
//! It is compiled only when the `native-test` feature is enabled, so no
//! production artifact contains it, and it never reads ambient configuration:
//! the endpoint, the certificate authority, and the bearer token are all
//! generated in-process for that run.
//!
//! Usage: `kubernetes-synthetic-apiserver --dir <directory>`

use std::{path::PathBuf, process::ExitCode};

use talos_pilot::kubernetes::synthetic::SyntheticApiserver;

fn main() -> ExitCode {
    let Some(directory) = parse_directory() else {
        eprintln!("usage: kubernetes-synthetic-apiserver --dir <directory>");
        return ExitCode::from(2);
    };

    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("could not start the synthetic server runtime: {error}");
            return ExitCode::FAILURE;
        }
    };

    runtime.block_on(async move {
        match serve(directory).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("synthetic apiserver failed: {error}");
                ExitCode::FAILURE
            }
        }
    })
}

fn parse_directory() -> Option<PathBuf> {
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        if argument == "--dir" {
            return arguments.next().map(PathBuf::from);
        }
    }
    None
}

async fn serve(directory: PathBuf) -> std::io::Result<()> {
    std::fs::create_dir_all(&directory)?;
    let server = SyntheticApiserver::start().await?;
    let kubeconfig = server.kubeconfig("synthetic-native-test", "synthetic-native-test");
    std::fs::write(directory.join("kubeconfig.yaml"), kubeconfig)?;

    // The harness reads this line to learn the port before it starts the app.
    println!("READY {}", server.endpoint());
    use std::io::Write as _;
    std::io::stdout().flush()?;

    // The harness owns this process: it terminates it after the suite and
    // verifies the process exited, so the listener cannot outlive the run.
    std::future::pending::<()>().await;
    Ok(())
}
