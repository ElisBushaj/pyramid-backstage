import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const varsPath = path.resolve(__dirname, "vars.ts");

/** Run `import vars.ts` in a child process so its fail-fast process.exit is observable. */
function bootWith(env: Record<string, string | undefined>) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", `import(${JSON.stringify(varsPath)}).then(() => process.exit(0))`],
    {
      env: { ...process.env, DOTENV_CONFIG_PATH: "/dev/null", ...env },
      encoding: "utf8",
      cwd: path.resolve(__dirname, "..", ".."),
    },
  );
}

describe("config/vars fail-fast (F00-T02)", () => {
  it("aborts startup (exit 1) naming the missing required key when DATABASE_URL is absent", () => {
    const r = bootWith({ NODE_ENV: "development", DATABASE_URL: undefined, SESSION_SECRET: "x" });
    expect(r.status).toBe(1);
    expect(`${r.stderr}${r.stdout}`).toContain("DATABASE_URL");
  });

  it("boots (exit 0) when the required vars are present", () => {
    const r = bootWith({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://stub:stub@localhost:5432/stub",
      SESSION_SECRET: "test-secret",
    });
    expect(r.status).toBe(0);
  });
});
