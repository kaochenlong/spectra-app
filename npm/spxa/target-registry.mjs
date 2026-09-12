const REQUIRED_RUNTIME_TUPLES = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-glibc",
  "linux-x64-glibc",
  "win32-x64",
])

/**
 * @typedef {object} SpxaTarget
 * @property {string} runtimeTuple
 * @property {string} packageName
 * @property {string} rustTarget
 * @property {string} os
 * @property {string} cpu
 * @property {"glibc" | null} libc
 * @property {"tar.gz" | "zip"} archiveExtension
 * @property {string} rawExecutableName
 * @property {string} npmExecutableName
 */

/** @type {readonly Readonly<SpxaTarget>[]} */
export const TARGETS = Object.freeze(
  [
    {
      runtimeTuple: "darwin-arm64",
      packageName: "@5xcampus/spxa-darwin-arm64",
      rustTarget: "aarch64-apple-darwin",
      os: "darwin",
      cpu: "arm64",
      libc: null,
      archiveExtension: "tar.gz",
      rawExecutableName: "specx",
      npmExecutableName: "spxa",
    },
    {
      runtimeTuple: "darwin-x64",
      packageName: "@5xcampus/spxa-darwin-x64",
      rustTarget: "x86_64-apple-darwin",
      os: "darwin",
      cpu: "x64",
      libc: null,
      archiveExtension: "tar.gz",
      rawExecutableName: "specx",
      npmExecutableName: "spxa",
    },
    {
      runtimeTuple: "linux-arm64-glibc",
      packageName: "@5xcampus/spxa-linux-arm64-gnu",
      rustTarget: "aarch64-unknown-linux-gnu",
      os: "linux",
      cpu: "arm64",
      libc: "glibc",
      archiveExtension: "tar.gz",
      rawExecutableName: "specx",
      npmExecutableName: "spxa",
    },
    {
      runtimeTuple: "linux-x64-glibc",
      packageName: "@5xcampus/spxa-linux-x64-gnu",
      rustTarget: "x86_64-unknown-linux-gnu",
      os: "linux",
      cpu: "x64",
      libc: "glibc",
      archiveExtension: "tar.gz",
      rawExecutableName: "specx",
      npmExecutableName: "spxa",
    },
    {
      runtimeTuple: "win32-x64",
      packageName: "@5xcampus/spxa-win32-x64",
      rustTarget: "x86_64-pc-windows-msvc",
      os: "win32",
      cpu: "x64",
      libc: null,
      archiveExtension: "zip",
      rawExecutableName: "specx.exe",
      npmExecutableName: "spxa.exe",
    },
  ].map((target) => Object.freeze(target)),
)

/**
 * @param {{ platform: string, arch: string, libc?: string }} runtime
 * @returns {string}
 */
export function runtimeTuple({ platform, arch, libc }) {
  return platform === "linux"
    ? `${platform}-${arch}-${libc ?? "unknown"}`
    : `${platform}-${arch}`
}

/**
 * @param {{ platform: string, arch: string, libc?: string }} runtime
 * @param {readonly Readonly<SpxaTarget>[]} [targets]
 * @returns {Readonly<SpxaTarget> | undefined}
 */
export function resolveTarget(runtime, targets = TARGETS) {
  if (runtime.platform === "linux" && runtime.libc !== "glibc") {
    return undefined
  }

  const tuple = runtimeTuple(runtime)
  return targets.find((target) => target.runtimeTuple === tuple)
}

/**
 * @param {readonly Readonly<SpxaTarget>[]} targets
 */
export function validateTargetRegistry(targets) {
  const seenTuples = new Set()
  const seenPackages = new Set()
  const seenRustTargets = new Set()

  for (const target of targets) {
    assertNonEmpty(target.runtimeTuple, "runtime tuple")
    assertNonEmpty(target.packageName, "package name")
    assertNonEmpty(target.rustTarget, "Rust target")
    assertNonEmpty(target.rawExecutableName, "raw executable name")
    assertNonEmpty(target.npmExecutableName, "npm executable name")

    rejectDuplicate(seenTuples, target.runtimeTuple, "runtime tuple")
    rejectDuplicate(seenPackages, target.packageName, "package name")
    rejectDuplicate(seenRustTargets, target.rustTarget, "Rust target")

    const derivedTuple = runtimeTuple({
      platform: target.os,
      arch: target.cpu,
      libc: target.libc ?? undefined,
    })
    if (derivedTuple !== target.runtimeTuple) {
      throw new Error(
        `runtime tuple metadata mismatch: ${target.runtimeTuple} != ${derivedTuple}`,
      )
    }
    if (target.os === "linux" && target.libc !== "glibc") {
      throw new Error(`Linux target must declare glibc: ${target.runtimeTuple}`)
    }
    if (target.os !== "linux" && target.libc !== null) {
      throw new Error(
        `non-Linux target must not declare libc: ${target.runtimeTuple}`,
      )
    }
    if (!REQUIRED_RUNTIME_TUPLES.includes(target.runtimeTuple)) {
      throw new Error(`unexpected runtime tuple: ${target.runtimeTuple}`)
    }
  }

  for (const tuple of REQUIRED_RUNTIME_TUPLES) {
    if (!seenTuples.has(tuple)) {
      throw new Error(`missing required runtime tuple: ${tuple}`)
    }
  }
}

/**
 * Full SemVer, using the pattern recommended by semver.org. Prefixes, range
 * operators, and dist-tags such as `latest` are all rejected.
 */
const EXACT_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/**
 * @param {string} version
 * @returns {boolean}
 */
export function isExactVersion(version) {
  return typeof version === "string" && EXACT_SEMVER.test(version)
}

/**
 * The platform packages as optionalDependencies, all pinned to one exact
 * version.
 *
 * `npmVersion` is an explicit release input supplied by the packaging tools. It
 * is never derived from a Rust file: this package is public and must not read
 * anything out of the private checkout.
 *
 * @param {string} npmVersion
 * @param {readonly Readonly<SpxaTarget>[]} [targets]
 * @returns {Record<string, string>}
 */
export function createOptionalDependencies(npmVersion, targets = TARGETS) {
  if (!isExactVersion(npmVersion)) {
    throw new Error(
      `npm version must be an exact SemVer version, got: ${JSON.stringify(npmVersion)}`,
    )
  }
  validateTargetRegistry(targets)
  return Object.fromEntries(
    targets.map((target) => [target.packageName, npmVersion]),
  )
}

/** @param {unknown} value @param {string} label */
function assertNonEmpty(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`target is missing ${label}`)
  }
}

/** @param {Set<string>} seen @param {string} value @param {string} label */
function rejectDuplicate(seen, value, label) {
  if (seen.has(value)) {
    throw new Error(`duplicate ${label}: ${value}`)
  }
  seen.add(value)
}

validateTargetRegistry(TARGETS)
