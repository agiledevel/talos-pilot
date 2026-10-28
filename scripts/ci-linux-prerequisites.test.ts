import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = "scripts/ci-linux-prerequisites.sh";

function run(body: string): string {
  return execFileSync("bash", ["-c", `source ${script}\n${body}`], { encoding: "utf8" });
}

describe.skipIf(process.platform === "win32")("bounded Ubuntu provisioning", () => {
  // This is an Ubuntu workflow command, not a cross-platform application API.
  // Execute its actual checked-in shell block, rather than a duplicate gate.
  it.skipIf(process.platform !== "linux")(
    "rejects findings/malformed SARIF without logging matched secrets",
    () => {
      const workflow = readFileSync(".github/workflows/security.yml", "utf8");
      const block =
        /      - name: Require zero vulnerabilities, secrets, and misconfigurations\n        run: \|\n((?:          [^\n]*\n?)+)/u.exec(
          workflow,
        )?.[1];
      if (block === undefined) {
        throw new Error("The Trivy result gate must have a testable shell block.");
      }
      const directory = mkdtempSync(join(tmpdir(), "talos-trivy-gate-"));
      const secret = "SYNTHETIC_MATCH_MUST_NOT_REACH_LOGS";
      try {
        for (const [payload, expected] of [
          [{ version: "2.1.0", runs: [{ results: [] }] }, 0],
          [
            {
              version: "2.1.0",
              runs: [{ results: [{ ruleId: "synthetic-secret", message: { text: secret } }] }],
            },
            1,
          ],
          [{ version: "2.1.0", runs: [] }, 1],
          [{ version: "2.1.0", runs: [{ results: null }] }, 1],
          [{ message: "not SARIF" }, 1],
        ] as const) {
          writeFileSync(join(directory, "trivy.sarif"), JSON.stringify(payload));
          const result = spawnSync(
            "bash",
            ["-e", "-o", "pipefail", "-c", block.replaceAll(/^          /gmu, "")],
            {
              encoding: "utf8",
              env: { ...process.env, RUNNER_TEMP: directory },
              timeout: 5_000,
              maxBuffer: 64 * 1024,
            },
          );
          expect(result.error).toBeUndefined();
          expect(result.signal).toBeNull();
          expect(result.status).not.toBeNull();
          expect(result.status === 0 ? 0 : 1).toBe(expected);
          expect(result.stdout + result.stderr).not.toContain(secret);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it("rejects use on the development host before invoking sudo", () => {
    const result = spawnSync("bash", [script, "native"], {
      encoding: "utf8",
      env: { ...process.env, RUNNER_ENVIRONMENT: "self-hosted" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only on an ephemeral GitHub-hosted");
  });

  it("uses no fallback after a successful download and configures offline", () => {
    expect(
      run(`
      fetch_packages() { printf 'fetch:%s\\n' "$*"; }
      apt_get() { printf 'install:%s\\n' "$*"; }
      install_packages libgtk-3-dev
    `),
    ).toBe(
      "fetch:https://archive.ubuntu.com/ubuntu libgtk-3-dev\ninstall:install -y --no-install-recommends --no-download libgtk-3-dev\n",
    );
  });

  it("tries one official fallback and never configures after two download failures", () => {
    const output = run(`
      fetch_packages() { printf 'fetch:%s\\n' "$1"; return 1; }
      apt_get() { echo UNEXPECTED-INSTALL; }
      if (install_packages libgtk-3-dev); then exit 9; fi
    `);
    expect(output).toContain("fetch:https://archive.ubuntu.com/ubuntu");
    expect(output).toContain("fetch:https://azure.archive.ubuntu.com/ubuntu");
    expect(output).not.toContain("UNEXPECTED-INSTALL");
  });

  it("downloads data candidates with one official fallback and never installs them", () => {
    const directory = mkdtempSync(join(tmpdir(), "talos-apt-reference-"));
    try {
      const output = execFileSync(
        "bash",
        [
          "-c",
          `source ${script}
        attempts=0
        fetch_references() { attempts=$((attempts + 1)); printf 'fetch:%s\\n' "$*"; [[ $attempts == 2 ]]; }
        apt_get() { echo UNEXPECTED-INSTALL; return 99; }
        download_references "$REF_TARGET" 'libfixture:amd64'
      `,
        ],
        { encoding: "utf8", env: { ...process.env, REF_TARGET: join(directory, "archives") } },
      );
      expect(output).toContain("fetch:https://archive.ubuntu.com/ubuntu libfixture:amd64");
      expect(output).toContain("fetch:https://azure.archive.ubuntu.com/ubuntu libfixture:amd64");
      expect(output).not.toContain("UNEXPECTED-INSTALL");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed reference specs before touching a destination or network", () => {
    const directory = mkdtempSync(join(tmpdir(), "talos-invalid-reference-"));
    try {
      for (const spec of [
        "--allow-unauthenticated",
        "libfixture=1;echo bad",
        "libfixture=not-a-version",
      ]) {
        const result = spawnSync(
          "bash",
          [
            "-c",
            `source ${script}; fetch_references() { echo UNEXPECTED-NETWORK; }; download_references "$REF_TARGET" "$SPEC"`,
          ],
          {
            encoding: "utf8",
            env: { ...process.env, SPEC: spec, REF_TARGET: join(directory, "archives") },
          },
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Invalid Ubuntu reference package");
        expect(result.stdout).not.toContain("UNEXPECTED-NETWORK");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not download references when signed metadata fails", () => {
    expect(
      run(
        `update_metadata() { return 17; }; if fetch_references https://archive.ubuntu.com/ubuntu 'libfixture'; then exit 9; else echo "status:$?"; fi`,
      ).trim(),
    ).toBe("status:17");
  });

  it("parses only complete pinned Playwright reports and rejects malformed or injected packages", () => {
    expect(
      run(
        `browser_packages $'Missing system dependencies (2):\\n  libasound2t64\\n  libgtk-3-0t64:amd64' 1`,
      ),
    ).toBe("libasound2t64\nlibgtk-3-0t64:amd64\n");
    expect(run(`browser_packages 'All system dependencies are installed.' 0`)).toBe("");
    for (const report of [
      "Missing system dependencies (2):\\n  libgtk-3-dev",
      "Missing system dependencies (1):\\n  --allow-unauthenticated",
      "Missing system dependencies (1):\\n  libgtk;echo-injected",
      "network failed",
    ]) {
      const result = spawnSync("bash", ["-c", `source ${script}; browser_packages "$REPORT" 1`], {
        encoding: "utf8",
        env: { ...process.env, REPORT: report.replaceAll("\\n", "\n") },
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
    }
  });

  it("propagates offline installation failure", () => {
    const output = run(`
      fetch_packages() { return 0; }
      apt_get() { return 17; }
      if install_packages libgtk-3-dev; then exit 9; else echo "status:$?"; fi
    `);
    expect(output.trim()).toBe("status:17");
  });
});
