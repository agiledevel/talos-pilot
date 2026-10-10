// Command delayedhelper is a process fixture for Rust supervisor deadline tests.
package main

import "time"

func main() {
	time.Sleep(30 * time.Second)
}
