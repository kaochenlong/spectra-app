import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { SPXA_PACKAGE_NAME } from "../package-metadata.mjs"
import {
  PACK_REPORT_FILENAME,
  SENTINEL_NAME,
  assertNoPathFallback,
  checkSelfUpdateLeavesTheBinary,
  createSandbox,
  parseArguments,
  readPackReport,
  selectHostTarballs,
} from "./smoke.mjs"

const HOST_TUPLE = "darwin-arm64"
const HOST_RUNTIME = { platform: "darwin", arch: "arm64" }

function report(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    npmVersion: "0.1.0",
    coreVersion: "3.0.0",
    dirty: false,
    packages: [
      {
        name: SPXA_PACKAGE_NAME,
        version: "0.1.0",
        tarball: "tarballs/spxa.tgz",
      },
      {
        name: "@kaochenlong/spxa-darwin-arm64",
        version: "0.1.0",
        tarball: "tarballs/native.tgz",
      },
    ],
    ...overrides,
  }
}

function artifacts(data = report(), files = ["spxa.tgz", "native.tgz"]) {
  const sandbox = createSandbox()
  const directory = join(sandbox.root, "staging")
  mkdirSync(join(directory, "tarballs"), { recursive: true })
  for (const file of files) {
    writeFileSync(join(directory, "tarballs", file), `${file} contents\n`)
  }
  writeFileSync(
    join(directory, PACK_REPORT_FILENAME),
    `${JSON.stringify(data, null, 2)}\n`,
  )
  return { sandbox, directory }
}

/** A stand-in for the native executable, driven by a small script body. */
function standIn(directory: string, body: string[]): string {
  mkdirSync(directory, { recursive: true })
  const executable = join(directory, "spxa")
  writeFileSync(executable, ["#!/usr/bin/env node", ...body].join("\n"))
  chmodSync(executable, 0o755)
  return executable
}

describe("smoke arguments", () => {
  it("requires exactly one mode", () => {
    expect(() => parseArguments([])).toThrow(
      /Pass --artifacts <dir> or --registry-install <spec>/,
    )
    expect(() =>
      parseArguments([
        "--artifacts",
        "/in",
        "--registry-install",
        `${SPXA_PACKAGE_NAME}@next`,
      ]),
    ).toThrow(/separate modes/)
    expect(parseArguments(["--artifacts", "/in"]).artifacts).toBe("/in")
    expect(
      parseArguments(["--registry-install", `${SPXA_PACKAGE_NAME}@next`])
        .registryInstall,
    ).toBe(`${SPXA_PACKAGE_NAME}@next`)
    expect(() => parseArguments(["--artifacts"])).toThrow(/needs a value/)
    expect(() => parseArguments(["--nope"])).toThrow(/Unknown argument/)
  })
})

describe("smoke sandbox isolation", () => {
  it("creates isolated directories and a fake spectra that records execution", () => {
    const sandbox = createSandbox()
    try {
      for (const directory of [
        sandbox.prefix,
        sandbox.cache,
        sandbox.project,
        sandbox.fakeBin,
        sandbox.home,
      ]) {
        expect(existsSync(directory), directory).toBe(true)
      }
      expect(sandbox.sentinel.endsWith(SENTINEL_NAME)).toBe(true)
      expect(existsSync(sandbox.sentinel)).toBe(false)
      expect(() => assertNoPathFallback(sandbox)).not.toThrow()

      // The project has a package.json so a local install has somewhere to land
      expect(
        JSON.parse(readFileSync(join(sandbox.project, "package.json"), "utf8"))
          .private,
      ).toBe(true)

      // Running the fake spectra is exactly what must never happen
      spawnSync(join(sandbox.fakeBin, "spectra"), [], { encoding: "utf8" })
      expect(existsSync(sandbox.sentinel)).toBe(true)
      expect(() => assertNoPathFallback(sandbox)).toThrow(
        /was executed. The npm distribution must never fall back/,
      )
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  })
})

describe("smoke delivery selection", () => {
  it("picks the host's platform tarball and the main tarball", () => {
    const { sandbox, directory } = artifacts()
    try {
      const selected = selectHostTarballs(
        directory,
        readPackReport(directory),
        HOST_RUNTIME,
      )
      expect(selected.target.runtimeTuple).toBe(HOST_TUPLE)
      expect(selected.npmVersion).toBe("0.1.0")
      expect(selected.main.endsWith("spxa.tgz")).toBe(true)
      expect(selected.native.endsWith("native.tgz")).toBe(true)
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  })

  it("says plainly when this host has no platform package in the delivery", () => {
    const { sandbox, directory } = artifacts(
      report({
        packages: [
          {
            name: SPXA_PACKAGE_NAME,
            version: "0.1.0",
            tarball: "tarballs/spxa.tgz",
          },
        ],
      }),
      ["spxa.tgz"],
    )
    try {
      expect(() =>
        selectHostTarballs(directory, readPackReport(directory), HOST_RUNTIME),
      ).toThrow(
        /has no @kaochenlong\/spxa-darwin-arm64 tarball, so this host cannot be verified/,
      )
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  })

  it("refuses an unsupported host and a missing tarball", () => {
    const { sandbox, directory } = artifacts()
    try {
      expect(() =>
        selectHostTarballs(directory, readPackReport(directory), {
          platform: "linux",
          arch: "x64",
          libc: "musl",
        }),
      ).toThrow(/is not a supported runtime/)

      rmSync(join(directory, "tarballs", "native.tgz"))
      expect(() =>
        selectHostTarballs(directory, readPackReport(directory), HOST_RUNTIME),
      ).toThrow(/missing its tarball/)
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  })

  it("requires a pack report", () => {
    const sandbox = createSandbox()
    try {
      expect(() => readPackReport(sandbox.root)).toThrow(/No pack-report\.json/)
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  })
})

describe("smoke self-update check", () => {
  function invokeStandIn(executable: string) {
    return (args: string[], options: { allowFailure?: boolean } = {}) => {
      const result = spawnSync(executable, args, { encoding: "utf8" })
      if (!options.allowFailure && result.status !== 0) {
        throw new Error(`stand-in exited ${result.status}`)
      }
      return result
    }
  }

  it("accepts an exit 1 that points at npm and leaves the binary alone", () => {
    const sandbox = createSandbox()
    try {
      const executable = standIn(join(sandbox.root, "native"), [
        `process.stderr.write('Error: spxa is installed by npm and cannot replace its own executable. Update a global install with \`npm install -g ${SPXA_PACKAGE_NAME}@latest\`.\\n')`,
        "process.exit(1)",
      ])

      const result = checkSelfUpdateLeavesTheBinary(
        invokeStandIn(executable),
        executable,
        "stand-in",
      )
      expect(result.sha256).toHaveLength(64)
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  })

  it("fails when self-update succeeds, forgets npm, or rewrites the binary", () => {
    const sandbox = createSandbox()
    try {
      const succeeds = standIn(join(sandbox.root, "succeeds"), [
        "process.exit(0)",
      ])
      expect(() =>
        checkSelfUpdateLeavesTheBinary(
          invokeStandIn(succeeds),
          succeeds,
          "succeeds",
        ),
      ).toThrow(/self-update exited 0, expected 1/)

      const silent = standIn(join(sandbox.root, "silent"), ["process.exit(1)"])
      expect(() =>
        checkSelfUpdateLeavesTheBinary(invokeStandIn(silent), silent, "silent"),
      ).toThrow(/did not point at npm/)

      const rewrites = standIn(join(sandbox.root, "rewrites"), [
        "const { writeFileSync } = require('node:fs')",
        `process.stderr.write('npm install -g ${SPXA_PACKAGE_NAME}@latest\\n')`,
        "writeFileSync(process.argv[1], '#!/usr/bin/env node\\nprocess.exit(1)\\n')",
        "process.exit(1)",
      ])
      expect(() =>
        checkSelfUpdateLeavesTheBinary(
          invokeStandIn(rewrites),
          rewrites,
          "rewrites",
        ),
      ).toThrow(/replaced the native executable/)

      expect(() =>
        checkSelfUpdateLeavesTheBinary(
          invokeStandIn(succeeds),
          join(sandbox.root, "absent", "spxa"),
          "absent",
        ),
      ).toThrow(/no native executable at/)
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  })
})
