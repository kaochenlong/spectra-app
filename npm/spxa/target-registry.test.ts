import { describe, expect, it } from "vitest"

import {
  TARGETS,
  createOptionalDependencies,
  isExactVersion,
  resolveTarget,
  validateTargetRegistry,
} from "./target-registry.mjs"

const EXPECTED_TARGETS = [
  {
    runtimeTuple: "darwin-arm64",
    packageName: "@kaochenlong/spxa-darwin-arm64",
    rustTarget: "aarch64-apple-darwin",
    os: "darwin",
    cpu: "arm64",
    libc: null,
    archiveExtension: "tar.gz",
    rawExecutableName: "spxa",
    npmExecutableName: "spxa",
  },
  {
    runtimeTuple: "darwin-x64",
    packageName: "@kaochenlong/spxa-darwin-x64",
    rustTarget: "x86_64-apple-darwin",
    os: "darwin",
    cpu: "x64",
    libc: null,
    archiveExtension: "tar.gz",
    rawExecutableName: "spxa",
    npmExecutableName: "spxa",
  },
  {
    runtimeTuple: "linux-arm64-glibc",
    packageName: "@kaochenlong/spxa-linux-arm64-gnu",
    rustTarget: "aarch64-unknown-linux-gnu",
    os: "linux",
    cpu: "arm64",
    libc: "glibc",
    archiveExtension: "tar.gz",
    rawExecutableName: "spxa",
    npmExecutableName: "spxa",
  },
  {
    runtimeTuple: "linux-x64-glibc",
    packageName: "@kaochenlong/spxa-linux-x64-gnu",
    rustTarget: "x86_64-unknown-linux-gnu",
    os: "linux",
    cpu: "x64",
    libc: "glibc",
    archiveExtension: "tar.gz",
    rawExecutableName: "spxa",
    npmExecutableName: "spxa",
  },
  {
    runtimeTuple: "win32-x64",
    packageName: "@kaochenlong/spxa-win32-x64",
    rustTarget: "x86_64-pc-windows-msvc",
    os: "win32",
    cpu: "x64",
    libc: null,
    archiveExtension: "zip",
    rawExecutableName: "spxa.exe",
    npmExecutableName: "spxa.exe",
  },
]

describe("spxa target registry", () => {
  it("defines the five supported runtime, npm, and Rust mappings", () => {
    expect(TARGETS).toEqual(EXPECTED_TARGETS)
    expect(() => validateTargetRegistry(TARGETS)).not.toThrow()
  })

  it.each(EXPECTED_TARGETS)(
    "resolves $runtimeTuple to exactly one package",
    (expected) => {
      expect(
        resolveTarget({
          platform: expected.os,
          arch: expected.cpu,
          libc: expected.libc ?? undefined,
        }),
      ).toEqual(expected)
    },
  )

  it("rejects Linux musl and an absent libc marker", () => {
    expect(
      resolveTarget({ platform: "linux", arch: "x64", libc: "musl" }),
    ).toBeUndefined()
    expect(resolveTarget({ platform: "linux", arch: "x64" })).toBeUndefined()
  })

  it("rejects duplicate and missing registry entries", () => {
    expect(() =>
      validateTargetRegistry([...TARGETS.slice(0, -1), TARGETS[0]]),
    ).toThrow(/duplicate runtime tuple: darwin-arm64/)
    expect(() => validateTargetRegistry(TARGETS.slice(0, -1))).toThrow(
      /missing required runtime tuple: win32-x64/,
    )
  })

  it("pins every platform package to one exact npm version", () => {
    const dependencies = createOptionalDependencies("0.1.0")

    expect(Object.keys(dependencies)).toEqual(
      EXPECTED_TARGETS.map((target) => target.packageName),
    )
    expect(new Set(Object.values(dependencies))).toEqual(new Set(["0.1.0"]))
  })

  it("accepts full SemVer versions, including prereleases", () => {
    for (const version of [
      "0.0.1",
      "1.2.3",
      "10.20.30",
      "0.1.0-next.1",
      "1.0.0-rc.1",
      "1.0.0-rc.1+build.5",
      "1.0.0+20260912",
    ]) {
      expect(isExactVersion(version), version).toBe(true)
      expect(
        new Set(Object.values(createOptionalDependencies(version))),
      ).toEqual(new Set([version]))
    }
  })

  it("rejects ranges, tags and malformed versions", () => {
    for (const version of [
      "1.2",
      "1.2.3.4",
      "v1.2.3",
      "01.2.3",
      "1.2.3-",
      "^1.2.3",
      "~1.2.3",
      "1.2.x",
      "latest",
      "next",
      " 1.2.3",
      "",
    ]) {
      expect(isExactVersion(version), version).toBe(false)
      expect(() => createOptionalDependencies(version), version).toThrow(
        /must be an exact SemVer version/,
      )
    }
  })
})
