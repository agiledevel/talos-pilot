# Protocol fixtures

`helper-v1-rust.hex` is the hexadecimal Protobuf encoding of a v1 handshake
request produced by Rust `prost` 0.14.4 from `helper/v1/envelope.proto`. It
contains an explicitly absent session ID, a present operation ID, and
`u64::MAX`. Rust and generated Go tests decode the same fixture to verify the
cross-language field numbers and wire representations.
