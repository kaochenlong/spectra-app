import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { TARGETS } from "../target-registry.mjs"
import {
  MAIN_PACKAGE_ALLOWLIST,
  PACK_REPORT_FILENAME,
  assertAllowedPaths,
  inspectTarball,
  nativePackageAllowlist,
  pack,
  parseArguments,
  verifyDelivery,
} from "./pack.mjs"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempRoot(prefix = "spxa-pack-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

const sha256 = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex")

/** A complete delivery with correct checksums, shaped like the export script's output. */
function delivery(overrides: Record<string, unknown> = {}): string {
  const directory = join(tempRoot(), "artifacts")
  mkdirSync(join(directory, "notices"), { recursive: true })

  const notices = ["LICENSE", "THIRD_PARTY_NOTICES"].map((file) => {
    const body = `${file} for the native executable\n`
    writeFileSync(join(directory, "notices", file), body)
    return { file, sha256: sha256(body) }
  })

  const targets = TARGETS.map((target) => {
    const bytes = `native bytes for ${target.rustTarget}\n`
    const relative = join(target.rustTarget, target.npmExecutableName)
    mkdirSync(join(directory, target.rustTarget), { recursive: true })
    writeFileSync(join(directory, relative), bytes)
    return {
      rustTarget: target.rustTarget,
      runtimeTuple: target.runtimeTuple,
      packageName: target.packageName,
      binary: relative,
      sha256: sha256(bytes),
      builderIdentity: "rustc 1.88.0 (fixture)",
      minimumRuntime: { os: "fixture os", libc: target.libc },
    }
  })

  writeFileSync(
    join(directory, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        mode: "release",
        dirty: false,
        npmVersion: "0.1.0",
        coreVersion: "3.0.0",
        coreRevision: "a".repeat(40),
        launcherRevision: "b".repeat(40),
        targets,
        notices,
        ...overrides,
      },
      null,
      2,
    )}\n`,
  )

  return directory
}

function patchManifest(
  directory: string,
  mutate: (manifest: Record<string, any>) => void,
): void {
  const path = join(directory, "manifest.json")
  const manifest = JSON.parse(readFileSync(path, "utf8"))
  mutate(manifest)
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

describe("pack allowlist enforcement", () => {
  it("rejects traversal, absolute, unexpected and missing entries", () => {
    const allowlist = ["package.json", "spxa"]

    expect(() =>
      assertAllowedPaths(["package.json", "spxa"], allowlist, "fixture"),
    ).not.toThrow()

    expect(() =>
      assertAllowedPaths(
        ["package.json", "spxa", "../outside"],
        allowlist,
        "fixture",
      ),
    ).toThrow(/escapes the package: \.\.\/outside/)
    expect(() =>
      assertAllowedPaths(
        ["package.json", "spxa", "nested/../../outside"],
        allowlist,
        "fixture",
      ),
    ).toThrow(/escapes the package/)
    expect(() =>
      assertAllowedPaths(
        ["package.json", "spxa", "/etc/passwd"],
        allowlist,
        "fixture",
      ),
    ).toThrow(/absolute path/)
    expect(() =>
      assertAllowedPaths(
        ["package.json", "spxa", "C:\\Windows\\system32"],
        allowlist,
        "fixture",
      ),
    ).toThrow(/absolute path/)
    expect(() =>
      assertAllowedPaths(["package.json"], allowlist, "fixture"),
    ).toThrow(/missing spxa/)
  })

  // Scenario: Packed contents are checked — proprietary source and specification artifacts are rejected
  it("rejects proprietary sources, Git metadata and specification artifacts", () => {
    const allowlist = nativePackageAllowlist("spxa")
    for (const injected of [
      "src/main.rs",
      "Cargo.toml",
      "Cargo.lock",
      ".git/config",
      "docs/specs/changes/npm-cli-distribution/proposal.md",
      "spxa.dSYM/Contents/Info.plist",
      "node_modules/vitest/package.json",
    ]) {
      expect(() =>
        assertAllowedPaths(
          [...allowlist, injected],
          allowlist,
          "native fixture",
        ),
      ).toThrow(/unexpected entry/)
    }
  })

  it("rejects a tarball that carries a symbolic link", () => {
    const root = tempRoot()
    const packageDirectory = join(root, "package")
    mkdirSync(packageDirectory, { recursive: true })
    writeFileSync(join(packageDirectory, "package.json"), "{}\n")
    writeFileSync(join(packageDirectory, "spxa"), "native\n")
    writeFileSync(join(packageDirectory, "LICENSE"), "license\n")
    symlinkSync("LICENSE", join(packageDirectory, "THIRD_PARTY_NOTICES"))

    const tarball = join(root, "linked.tgz")
    execFileSync("tar", ["-czf", tarball, "-C", root, "package"])

    expect(() =>
      inspectTarball(tarball, nativePackageAllowlist("spxa"), "native fixture"),
    ).toThrow(/symbolic link/)
  })
})

describe("pack delivery verification", () => {
  it("accepts a complete delivery", () => {
    expect(verifyDelivery(delivery()).npmVersion).toBe("0.1.0")
  })

  // Scenario: Incomplete or mixed artifacts are rejected
  it("rejects a missing platform and names it", () => {
    const directory = delivery()
    patchManifest(directory, (manifest) => {
      manifest.targets = manifest.targets.filter(
        (entry: { rustTarget: string }) =>
          entry.rustTarget !== "x86_64-pc-windows-msvc",
      )
    })

    expect(() => verifyDelivery(directory)).toThrow(
      /missing x86_64-pc-windows-msvc \(@kaochenlong\/spxa-win32-x64\)/,
    )
  })

  it("rejects a checksum mismatch and names the file", () => {
    const directory = delivery()
    writeFileSync(
      join(directory, "aarch64-apple-darwin", "spxa"),
      "tampered bytes\n",
    )

    expect(() => verifyDelivery(directory)).toThrow(
      /Checksum mismatch for aarch64-apple-darwin/,
    )
  })

  it("rejects a mixed version", () => {
    const directory = delivery()

    expect(() =>
      verifyDelivery(directory, { expectedVersion: "0.1.1" }),
    ).toThrow(/does not match the delivery's npmVersion 0\.1\.0/)
    patchManifest(directory, (manifest) => {
      manifest.npmVersion = "latest"
    })
    expect(() => verifyDelivery(directory)).toThrow(
      /not an exact SemVer version/,
    )
  })

  it("rejects a dirty delivery unless a development pack is requested", () => {
    const directory = delivery({ dirty: true, mode: "development" })

    expect(() => verifyDelivery(directory)).toThrow(/marked dirty/)
    expect(verifyDelivery(directory, { development: true }).dirty).toBe(true)
  })

  it("rejects a delivery without a compatibility or source identity", () => {
    const noRuntime = delivery()
    patchManifest(noRuntime, (manifest) => {
      delete manifest.targets[0].minimumRuntime
    })
    expect(() => verifyDelivery(noRuntime)).toThrow(
      /does not declare a minimum runtime/,
    )

    const noBuilder = delivery()
    patchManifest(noBuilder, (manifest) => {
      manifest.targets[1].builderIdentity = ""
    })
    expect(() => verifyDelivery(noBuilder)).toThrow(/no builderIdentity/)

    const noCore = delivery()
    patchManifest(noCore, (manifest) => {
      manifest.coreRevision = ""
    })
    expect(() => verifyDelivery(noCore)).toThrow(/core identity/)
  })

  it("rejects a delivery whose licence files are missing", () => {
    const missingNotice = delivery()
    patchManifest(missingNotice, (manifest) => {
      manifest.notices = manifest.notices.filter(
        (notice: { file: string }) => notice.file !== "THIRD_PARTY_NOTICES",
      )
    })
    expect(() => verifyDelivery(missingNotice)).toThrow(
      /does not carry the native THIRD_PARTY_NOTICES/,
    )

    const tamperedNotice = delivery()
    writeFileSync(join(tamperedNotice, "notices", "LICENSE"), "different\n")
    expect(() => verifyDelivery(tamperedNotice)).toThrow(
      /does not match its checksum/,
    )
  })

  it("rejects a schema version it does not read", () => {
    const directory = delivery({ schemaVersion: 2 })
    expect(() => verifyDelivery(directory)).toThrow(/schemaVersion 2/)
  })
})

describe("pack arguments", () => {
  it("requires the explicit artifacts and output directories", () => {
    expect(() => parseArguments([])).toThrow(/--artifacts is required/)
    expect(() => parseArguments(["--artifacts", "/in"])).toThrow(
      /--output is required/,
    )
    expect(() => parseArguments(["--artifacts"])).toThrow(
      /--artifacts needs a value/,
    )
    expect(() => parseArguments(["--wat"])).toThrow(/Unknown argument/)
  })
})

describe("pack produces inspected tarballs", () => {
  it("refuses a non-empty staging directory", () => {
    const output = join(tempRoot(), "staging")
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, "leftover.tgz"), "from a previous run")

    expect(() => pack({ artifacts: delivery(), output })).toThrow(
      /already contains files/,
    )
  })

  // Scenario: Packed contents are checked — really run npm pack, then unpack and compare against the allowlist
  it("packs the main and native tarballs and unpacks them against the allowlist", () => {
    const artifacts = delivery()
    const output = join(tempRoot(), "staging")

    const report = pack({ artifacts, output })

    expect(report.npmVersion).toBe("0.1.0")
    expect(report.coreVersion).toBe("3.0.0")
    expect(report.dirty).toBe(false)
    expect(report.packages).toHaveLength(TARGETS.length + 1)
    expect(existsSync(join(output, PACK_REPORT_FILENAME))).toBe(true)

    const main = report.packages[0]
    expect(main.name).toBe("spxa")
    expect(main.version).toBe("0.1.0")
    expect(
      inspectTarball(
        join(output, main.tarball),
        MAIN_PACKAGE_ALLOWLIST,
        "main",
      ),
    ).toEqual([...MAIN_PACKAGE_ALLOWLIST].sort())

    // The main package's version and optionalDependencies are this release's exact version
    const mainSandbox = tempRoot("spxa-main-")
    execFileSync("tar", ["-xzf", join(output, main.tarball), "-C", mainSandbox])
    const mainManifest = JSON.parse(
      readFileSync(join(mainSandbox, "package", "package.json"), "utf8"),
    )
    expect(mainManifest.version).toBe("0.1.0")
    expect(new Set(Object.values(mainManifest.optionalDependencies))).toEqual(
      new Set(["0.1.0"]),
    )
    expect(Object.keys(mainManifest.bin)).toEqual(["spxa"])
    expect(mainManifest.devDependencies).toBeUndefined()
    expect(mainManifest.scripts).toBeUndefined()

    for (const target of TARGETS) {
      const entry = report.packages.find(
        (candidate) => candidate.name === target.packageName,
      )
      expect(entry, target.packageName).toBeDefined()
      const allowlist = nativePackageAllowlist(target.npmExecutableName)
      expect(
        inspectTarball(
          join(output, entry!.tarball),
          allowlist,
          target.packageName,
        ),
      ).toEqual([...allowlist].sort())

      const sandbox = tempRoot("spxa-native-")
      execFileSync("tar", ["-xzf", join(output, entry!.tarball), "-C", sandbox])
      const unpacked = join(sandbox, "package")
      const manifest = JSON.parse(
        readFileSync(join(unpacked, "package.json"), "utf8"),
      )
      expect(manifest.name).toBe(target.packageName)
      expect(manifest.version).toBe("0.1.0")
      expect(manifest.os).toEqual([target.os])
      expect(manifest.cpu).toEqual([target.cpu])
      expect(manifest.spxa.coreVersion).toBe("3.0.0")
      expect(manifest.spxa.executable).toBe(target.npmExecutableName)
      expect(manifest.spxa.minimumRuntime.os).toBe("fixture os")
      expect(manifest.spxa.builderIdentity).toBe("rustc 1.88.0 (fixture)")

      // The delivered bytes reach the tarball unchanged
      const executable = join(unpacked, target.npmExecutableName)
      expect(readFileSync(executable, "utf8")).toBe(
        `native bytes for ${target.rustTarget}\n`,
      )
      expect(sha256(readFileSync(executable))).toBe(manifest.spxa.sha256)
      // Every platform package carries its own licence and notices
      expect(readFileSync(join(unpacked, "LICENSE"), "utf8")).toContain(
        "LICENSE for the native executable",
      )
      expect(
        readFileSync(join(unpacked, "THIRD_PARTY_NOTICES"), "utf8"),
      ).toContain("THIRD_PARTY_NOTICES")
    }
  }, 120_000)

  it("packs a host-only development delivery and marks it incomplete", () => {
    const artifacts = delivery()
    patchManifest(artifacts, (manifest) => {
      manifest.dirty = true
      manifest.mode = "development"
      manifest.targets = manifest.targets.filter(
        (entry: { rustTarget: string }) =>
          entry.rustTarget === "aarch64-apple-darwin",
      )
    })
    const output = join(tempRoot(), "staging")

    const report = pack({ artifacts, output, development: true })

    expect(report.complete).toBe(false)
    expect(report.dirty).toBe(true)
    expect(report.packages.map((entry) => entry.name)).toEqual([
      "spxa",
      "@kaochenlong/spxa-darwin-arm64",
    ])
  }, 120_000)

  it("still requires the full matrix for a release pack", () => {
    const artifacts = delivery()
    patchManifest(artifacts, (manifest) => {
      manifest.targets = manifest.targets.filter(
        (entry: { rustTarget: string }) =>
          entry.rustTarget === "aarch64-apple-darwin",
      )
    })

    expect(() =>
      pack({ artifacts, output: join(tempRoot(), "staging") }),
    ).toThrow(/missing x86_64-apple-darwin/)
  })

  it("stops before packing when the delivery cannot be verified", () => {
    const artifacts = delivery()
    patchManifest(artifacts, (manifest) => {
      manifest.targets = manifest.targets.slice(0, 2)
    })
    const output = join(tempRoot(), "staging")
    let packCalls = 0

    expect(() =>
      pack(
        { artifacts, output },
        {
          runNpmPack: () => {
            packCalls += 1
            return ""
          },
        },
      ),
    ).toThrow(/missing/)
    expect(packCalls).toBe(0)
    expect(existsSync(join(output, PACK_REPORT_FILENAME))).toBe(false)
    // A failed verification writes nothing at all: the staging directory is
    // never even created.
    expect(existsSync(output) ? readdirSync(output) : []).toEqual([])
  })
})
