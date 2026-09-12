import { spawn, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const LAUNCHER = join(import.meta.dirname, "launcher.mjs")
const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "spxa-lifecycle-"))
  tempRoots.push(root)
  return root
}

function executableFixture(root: string, body: string[]): string {
  const fixture = join(root, process.platform === "win32" ? "spxa.cmd" : "spxa")
  writeFileSync(fixture, ["#!/usr/bin/env node", ...body].join("\n"))
  chmodSync(fixture, 0o755)
  return fixture
}

/** Drive the launcher through the real `runCli` so the parent's own exit result is what we observe. */
function launcherDriver(fixture: string, argv: string[] = []): string {
  return [
    `const { runCli } = await import(${JSON.stringify(LAUNCHER)});`,
    `await runCli({`,
    `  argv: ${JSON.stringify(argv)},`,
    `  runtime: { platform: "darwin", arch: "arm64" },`,
    `  resolvePackage: () => ({`,
    `    packageName: "@kaochenlong/spxa-darwin-arm64",`,
    `    executable: ${JSON.stringify(fixture)},`,
    `    npmVersion: "0.1.0",`,
    `    coreVersion: "3.0.0",`,
    `  }),`,
    `});`,
    `if (process.listenerCount("SIGINT") !== 0 || process.listenerCount("SIGTERM") !== 0) {`,
    `  process.stderr.write("LEAKED_SIGNAL_LISTENERS\\n");`,
    `  process.exitCode = 90;`,
    `}`,
  ].join("\n")
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function waitForFile(path: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(path)) return
    await sleep(20)
  }
  throw new Error(`fixture never reported readiness: ${path}`)
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe("spxa launcher process lifecycle", () => {
  // Example: Native exit result — 0 / 2 / 7 pass through unchanged
  it.each([0, 2, 7])(
    "passes the child's exit code %i through unchanged",
    (code) => {
      const root = tempRoot()
      const fixture = executableFixture(root, [`process.exit(${code})`])

      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", launcherDriver(fixture)],
        { encoding: "utf8" },
      )

      expect(result.stderr).not.toContain("LEAKED_SIGNAL_LISTENERS")
      expect(result.status).toBe(code)
      expect(result.signal).toBeNull()
    },
  )

  // Scenario: POSIX interruption reaches the child
  it.skipIf(process.platform === "win32").each(["SIGINT", "SIGTERM"] as const)(
    "forwards %s to the child and leaves nothing running",
    async (signal) => {
      const root = tempRoot()
      const pidPath = join(root, "child.pid")
      const fixture = executableFixture(root, [
        "const { writeFileSync } = require('node:fs')",
        `writeFileSync(${JSON.stringify(pidPath)}, String(process.pid))`,
        "setTimeout(() => process.exit(0), 60_000)",
      ])

      const launcher = spawn(
        process.execPath,
        ["--input-type=module", "-e", launcherDriver(fixture)],
        { stdio: ["ignore", "pipe", "pipe"] },
      )
      const exited = new Promise<{
        code: number | null
        signal: string | null
      }>((done) =>
        launcher.once("exit", (code, sig) => done({ code, signal: sig })),
      )

      await waitForFile(pidPath)
      const childPid = Number(readFileSync(pidPath, "utf8"))
      expect(isAlive(childPid)).toBe(true)

      // Interrupt only the parent; the process group is left alone
      process.kill(launcher.pid!, signal)
      const outcome = await exited

      expect(outcome.signal).toBe(signal)
      for (let attempt = 0; attempt < 100 && isAlive(childPid); attempt += 1) {
        await sleep(20)
      }
      expect(isAlive(childPid)).toBe(false)
    },
    20_000,
  )

  // Scenario: POSIX interruption reaches the child — signal termination keeps its meaning
  it.skipIf(process.platform === "win32")(
    "terminates with the child's signal when the child is signalled",
    () => {
      const root = tempRoot()
      const fixture = executableFixture(root, [
        "process.kill(process.pid, 'SIGTERM')",
        "setTimeout(() => {}, 5_000)",
      ])

      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", launcherDriver(fixture)],
        { encoding: "utf8" },
      )

      expect(result.signal).toBe("SIGTERM")
    },
  )

  // Scenario: Windows termination is reported. Skipped unless the host is
  // Windows; the cross-platform run covers it. Windows has no POSIX signal
  // semantics, so what is asserted is the observable outcome: a nonzero exit
  // with no signal.
  it.runIf(process.platform === "win32")(
    "reports a terminated child on Windows with a nonzero result and no signal claim",
    () => {
      const root = tempRoot()
      const fixture = executableFixture(root, [
        "require('node:child_process').spawnSync('taskkill', ['/pid', String(process.pid), '/f'])",
        "setTimeout(() => {}, 5_000)",
      ])

      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", launcherDriver(fixture)],
        { encoding: "utf8" },
      )

      expect(result.status).not.toBe(0)
      expect(result.signal).toBeNull()
    },
  )
})
