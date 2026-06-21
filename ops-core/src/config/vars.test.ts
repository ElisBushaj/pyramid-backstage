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

/** Boot, then print the resolved `vars` as JSON so the parsers can be asserted. */
function bootAndDump(env: Record<string, string | undefined>) {
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      // tsx compiles to CJS, so the named `vars` export lands under `default`.
      `import(${JSON.stringify(varsPath)}).then((m) => { const v = m.vars ?? m.default?.vars ?? m.default; process.stdout.write(JSON.stringify(v)); process.exit(0); })`,
    ],
    {
      env: { ...process.env, DOTENV_CONFIG_PATH: "/dev/null", ...env },
      encoding: "utf8",
      cwd: path.resolve(__dirname, "..", ".."),
    },
  );
  return { status: r.status, vars: r.status === 0 ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
}

describe("config/vars fail-fast (F00-T02)", () => {
  it("aborts (exit 1) naming DATABASE_URL when it is absent in a non-test env", () => {
    const r = bootWith({ NODE_ENV: "development", DATABASE_URL: undefined, SESSION_SECRET: "x" });
    expect(r.status).toBe(1);
    expect(`${r.stderr}${r.stdout}`).toContain("DATABASE_URL");
  });

  it("aborts (exit 1) naming SESSION_SECRET when it is absent in a non-test env", () => {
    const r = bootWith({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://stub:stub@localhost:5432/stub",
      SESSION_SECRET: undefined,
    });
    expect(r.status).toBe(1);
    expect(`${r.stderr}${r.stdout}`).toContain("SESSION_SECRET");
  });

  it("treats an EMPTY required var as missing (exit 1)", () => {
    const r = bootWith({ NODE_ENV: "development", DATABASE_URL: "", SESSION_SECRET: "x" });
    expect(r.status).toBe(1);
    expect(`${r.stderr}${r.stdout}`).toContain("DATABASE_URL");
  });

  it("boots (exit 0) when the required vars are present in a non-test env", () => {
    const r = bootWith({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://stub:stub@localhost:5432/stub",
      SESSION_SECRET: "test-secret",
    });
    expect(r.status).toBe(0);
  });
});

describe("config/vars — test-mode relaxation", () => {
  it("boots WITHOUT DATABASE_URL / SESSION_SECRET when NODE_ENV=test (uses stub defaults)", () => {
    const r = bootAndDump({ NODE_ENV: "test", DATABASE_URL: undefined, SESSION_SECRET: undefined });
    expect(r.status).toBe(0);
    expect(r.vars.isTest).toBe(true);
    expect(r.vars.databaseUrl).toContain("stub");
    expect(r.vars.sessionSecret).toBe("test-secret");
  });
});

describe("config/vars — parsers and defaults", () => {
  const base = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://stub:stub@localhost:5432/stub",
    SESSION_SECRET: "test-secret",
  };

  it("applies the documented defaults when optional vars are unset", () => {
    const r = bootAndDump({
      ...base,
      PORT: undefined,
      REDIS_URL: undefined,
      HOLD_MINUTES_DEFAULT: undefined,
      VAT_RATE: undefined,
      SESSION_TTL_HOURS: undefined,
      OPS_CORE_SERVICE_TOKEN: undefined,
    });
    expect(r.status).toBe(0);
    expect(r.vars).toMatchObject({
      port: 4000,
      redisUrl: "redis://localhost:6379",
      holdMinutesDefault: 30,
      vatRate: 0.2,
      sessionTtlHours: 12,
      serviceToken: "",
      isProd: false,
    });
  });

  it("parses int vars and falls back on a non-numeric value", () => {
    const ok = bootAndDump({ ...base, PORT: "8080" });
    expect(ok.vars.port).toBe(8080);
    const bad = bootAndDump({ ...base, PORT: "not-a-number" });
    expect(bad.vars.port).toBe(4000); // fallback
  });

  it("parses float VAT_RATE and falls back on garbage / empty", () => {
    expect(bootAndDump({ ...base, VAT_RATE: "0.1" }).vars.vatRate).toBe(0.1);
    expect(bootAndDump({ ...base, VAT_RATE: "garbage" }).vars.vatRate).toBe(0.2);
    expect(bootAndDump({ ...base, VAT_RATE: "" }).vars.vatRate).toBe(0.2);
  });

  it("sets isProd only when NODE_ENV=production", () => {
    const prod = bootAndDump({ ...base, NODE_ENV: "production" });
    expect(prod.vars.isProd).toBe(true);
    expect(prod.vars.isTest).toBe(false);
  });

  it("carries the service token through when set (F17)", () => {
    expect(bootAndDump({ ...base, OPS_CORE_SERVICE_TOKEN: "shhh" }).vars.serviceToken).toBe("shhh");
  });
});
