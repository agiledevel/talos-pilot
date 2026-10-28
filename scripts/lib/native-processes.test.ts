import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { helperProcessCount, PROCESS_LIST_MAX_BYTES } from "./native-processes";

describe("native helper cleanup inspection", () => {
  it("counts helpers from a real subprocess emitting more than Node's default 1 MiB", () => {
    const count = helperProcessCount(false, (command, args, options) => {
      expect(command).toBe("ps");
      expect(args).toEqual(["-A", "-o", "args="]);
      expect(options.maxBuffer).toBe(PROCESS_LIST_MAX_BYTES);
      expect(options.timeout).toBe(5_000);
      return execFileSync(
        process.execPath,
        [
          "-e",
          `process.stdout.write('ordinary-process\\n'.repeat(100_000) + '/app/talos-pilot-helper\\ntalos-pilot-helper --fixture\\n/app/talos-pilot-helper-extra\\n');`,
        ],
        options,
      );
    });
    expect(count).toBe(2);
  });

  it("retains strict Windows CSV matching", () => {
    expect(
      helperProcessCount(true, (command, args) => {
        expect(command).toBe("tasklist");
        expect(args).toContain("IMAGENAME eq talos-pilot-helper.exe");
        return '"talos-pilot-helper.exe","123"\r\n"talos-pilot-helper.exe-extra","124"\r\n';
      }),
    ).toBe(1);
  });

  it("fails closed with an OS code but never attaches process arguments or raw child errors", () => {
    const secret = "SYNTHETIC_PROCESS_ARGUMENT_MUST_NOT_BE_LOGGED";
    let failure: unknown;
    try {
      helperProcessCount(false, () => {
        throw Object.assign(new Error(secret), { code: "ENOBUFS", stdout: secret, stderr: secret });
      });
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof Error))
      throw new Error("Inspection failure must not become a zero-process pass");
    expect(failure.message).toContain("ENOBUFS");
    expect(failure.message).not.toContain(secret);
    expect("cause" in failure).toBe(false);
    expect("stdout" in failure).toBe(false);
  });
});
