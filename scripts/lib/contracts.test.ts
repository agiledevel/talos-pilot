import { describe, expect, it } from "vitest";
import { normalizeToolVersion } from "./contracts";

describe("normalizeToolVersion", () => {
  it("keeps the POSIX plugin line unchanged", () => {
    expect(normalizeToolVersion("protoc-gen-go v1.36.12")).toBe("protoc-gen-go v1.36.12");
  });

  it("removes the Windows executable suffix from the tool name", () => {
    expect(normalizeToolVersion("protoc-gen-go.exe v1.36.12")).toBe("protoc-gen-go v1.36.12");
  });

  it("leaves a tool that reports only a version unchanged", () => {
    expect(normalizeToolVersion("libprotoc 36.2")).toBe("libprotoc 36.2");
  });

  it("leaves the multi-token Go toolchain line unchanged", () => {
    expect(normalizeToolVersion("go version go1.27.2 windows/amd64")).toBe(
      "go version go1.27.2 windows/amd64",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeToolVersion("  protoc-gen-go v1.36.12\n")).toBe("protoc-gen-go v1.36.12");
  });

  it("still reports a different pinned version as different", () => {
    expect(normalizeToolVersion("protoc-gen-go.exe v1.37.0")).not.toBe("protoc-gen-go v1.36.12");
  });

  it("does not rewrite a suffix that is not on the trailing version line", () => {
    expect(normalizeToolVersion("protoc-gen-go.exe")).toBe("protoc-gen-go.exe");
  });
});
