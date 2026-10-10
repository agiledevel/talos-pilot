//! Private, versioned Rust-to-Go message contract.

mod frame;
mod validate;

// Protobuf output is generated from the schema, which is its source of field
// and variant documentation. ts-rs/rustdoc cannot attach those comments.
#[allow(missing_docs)]
pub mod generated {
    //! Protobuf message types generated from `proto/helper/v1/envelope.proto`.

    include!(concat!(env!("OUT_DIR"), "/talos_pilot.helper.v1.rs"));
}

pub use frame::{FrameError, MAX_FRAME_BYTES, read_frame, write_frame};
pub use validate::{EnvelopeError, validate_envelope};
