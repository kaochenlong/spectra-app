import { execFileSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { launch, spawnNative } from "./launcher.mjs"

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "spxa-process-"))
  tempRoots.push(root)
  return root
}

/** A real executable that records the argv, cwd and environment it received. */
function recordingFixture(root: string, resultPath: string): string {
  const fixture = join(root, "spxa")
  writeFileSync(
    fixture,
    [
      "#!/usr/bin/env node",
      "const { writeFileSync } = require('node:fs')",
      `writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({`,
      "  argv: process.argv.slice(2),",
      "  cwd: process.cwd(),",
      "  marker: process.env.SPXA_FIXTURE_MARKER ?? null,",
      "  distribution: process.env.SPECTRA_CLI_DISTRIBUTION ?? null,",
      "}))",
    ].join("\n"),
  )
  chmodSync(fixture, 0o755)
  return fixture
}

describe("spxa launcher process contract", () => {
  // Example: Argument boundaries
  it("hands the original argument vector to a real executable without a shell", async () => {
    const root = tempRoot()
    const resultPath = join(root, "recorded.json")
    const fixture = recordingFixture(root, resultPath)
    const sentinel = join(root, "sentinel")
    const argv = [
      "show",
      "change with spaces",
      "--",
      `$(touch ${sentinel})`,
      "",
    ]

    const status = await launch({
      argv,
      runtime: { platform: "darwin", arch: "arm64" },
      resolvePackage: () => ({
        executable: fixture,
        npmVersion: "0.1.0",
        coreVersion: "3.0.0",
      }),
    })

    expect(status).toEqual({ code: 0, signal: null })
    const recorded = JSON.parse(readFileSync(resultPath, "utf8"))
    expect(recorded.argv).toEqual(argv)
    expect(existsSync(sentinel)).toBe(false)
  })

  it("inherits the working directory and the parent environment untouched", async () => {
    const root = tempRoot()
    const resultPath = join(root, "recorded.json")
    const fixture = recordingFixture(root, resultPath)
    const workingDirectory = mkdtempSync(join(tmpdir(), "spxa-cwd-"))
    tempRoots.push(workingDirectory)

    const previous = process.cwd()
    process.chdir(workingDirectory)
    try {
      await spawnNative(fixture, [], {
        parentEnv: { ...process.env, SPXA_FIXTURE_MARKER: "inherited" },
      })
    } finally {
      process.chdir(previous)
    }

    const recorded = JSON.parse(readFileSync(resultPath, "utf8"))
    expect(realpathSync(recorded.cwd)).toBe(realpathSync(workingDirectory))
    expect(recorded.marker).toBe("inherited")
    // The environment is inherited as-is: the launcher no longer injects a
    // distribution marker of its own.
    expect(recorded.distribution).toBeNull()
  })

  it("keeps the child's stdout and stderr on separate streams", () => {
    const root = tempRoot()
    const fixture = join(root, "spxa")
    writeFileSync(
      fixture,
      [
        "#!/usr/bin/env node",
        'process.stdout.write(\'{"handler":"json"}\\n\')',
        "process.stderr.write('a wrapper-free diagnostic\\n')",
      ].join("\n"),
    )
    chmodSync(fixture, 0o755)

    const driver = [
      `const { spawnNative } = await import(${JSON.stringify(join(import.meta.dirname, "launcher.mjs"))});`,
      `const status = await spawnNative(${JSON.stringify(fixture)}, []);`,
      "process.exitCode = status.code ?? 1;",
    ].join("\n")

    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", driver],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    )

    expect(stdout).toBe('{"handler":"json"}\n')
  })
})
