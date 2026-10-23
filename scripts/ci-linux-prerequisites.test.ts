import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = "scripts/ci-linux-prerequisites.sh";

function run(body: string): string {
  return execFileSync("bash", ["-c", `source ${script}\n${body}`], { encoding: "utf8" });
}

describe.skipIf(process.platform === "win32")("bounded Ubuntu provisioning", () => {
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
