import { spawn as nodeSpawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

import { TARGETS, resolveTarget, runtimeTuple } from "./target-registry.mjs"

const require = createRequire(import.meta.url)

/** The only argv shape the launcher answers itself; everything else is handed to the native executable untouched. */
const TOP_LEVEL_VERSION_FLAG = "--version"

export const LAUNCHER_ERROR_CODES = Object.freeze({
  unsupportedRuntime: "SPXA_UNSUPPORTED_RUNTIME",
  nativePackageMissing: "SPXA_NATIVE_PACKAGE_MISSING",
  nativePackageResolutionFailed: "SPXA_NATIVE_PACKAGE_RESOLUTION_FAILED",
  nativePackageInvalid: "SPXA_NATIVE_PACKAGE_INVALID",
  nativeVersionMismatch: "SPXA_NATIVE_VERSION_MISMATCH",
  nativeExecutableMissing: "SPXA_NATIVE_EXECUTABLE_MISSING",
  nativeExecutableNotExecutable: "SPXA_NATIVE_EXECUTABLE_NOT_EXECUTABLE",
  nativeSpawnFailed: "SPXA_NATIVE_SPAWN_FAILED",
  launcherFailure: "SPXA_LAUNCHER_FAILURE",
})

export class SpxaLauncherError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "SpxaLauncherError"
    this.code = code
  }
}

/**
 * @typedef {{ code: number | null, signal: NodeJS.Signals | null }} ChildStatus
 */

/**
 * @param {object} [options]
 * @param {string[]} [options.argv]
 * @param {{ platform: string, arch: string, libc?: string }} [options.runtime]
 * @param {(target: import("./target-registry.mjs").SpxaTarget, resolverOptions?: Parameters<typeof resolveNativeExecutable>[1]) => string} [options.resolveExecutable]
 * @param {Parameters<typeof resolveNativeExecutable>[1]} [options.resolverOptions]
 * @param {typeof nodeSpawn} [options.spawn]
 * @param {NodeJS.ProcessEnv} [options.parentEnv]
 * @returns {Promise<ChildStatus>}
 */
export async function launch(options = {}) {
  const argv = options.argv ?? process.argv.slice(2)
  const target = requireSupportedTarget(options.runtime ?? detectRuntime())
  const { executable } = resolveValidatedPackage(target, options)

  try {
    return await spawnNative(executable, argv, {
      spawn: options.spawn,
      parentEnv: options.parentEnv,
    })
  } catch (error) {
    throw nativeSpawnError(target, error)
  }
}

/**
 * The platform target for this runtime, or a hard stop when it is unsupported.
 *
 * Nothing is resolved, downloaded, or looked up on PATH for an unsupported
 * runtime.
 *
 * @param {{ platform: string, arch: string, libc?: string }} runtime
 * @returns {Readonly<import("./target-registry.mjs").SpxaTarget>}
 */
function requireSupportedTarget(runtime) {
  const target = resolveTarget(runtime)
  if (target) {
    return target
  }

  const supportedTuples = TARGETS.map((candidate) => candidate.runtimeTuple)
  throw new SpxaLauncherError(
    LAUNCHER_ERROR_CODES.unsupportedRuntime,
    `Unsupported runtime "${runtimeTuple(runtime)}". Supported runtimes: ${supportedTuples.join(", ")}. Run spxa on one of them instead.`,
  )
}

/**
 * @param {Readonly<import("./target-registry.mjs").SpxaTarget>} target
 * @param {Parameters<typeof launch>[0]} options
 * @returns {NativePackage}
 */
function resolveValidatedPackage(target, options) {
  const resolvePackage = options.resolvePackage ?? resolveNativePackage
  try {
    return resolvePackage(target, options.resolverOptions)
  } catch (error) {
    if (error instanceof SpxaLauncherError) {
      throw error
    }
    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativePackageResolutionFailed,
      `Failed to resolve native package "${target.packageName}" (${errorReason(error)}). ${reinstallHint()}`,
      error,
    )
  }
}

/**
 * @param {string[]} argv
 * @returns {boolean}
 */
export function isTopLevelVersionRequest(argv) {
  return argv.length === 1 && argv[0] === TOP_LEVEL_VERSION_FLAG
}

/**
 * The installed npmVersion and coreVersion, read from validated native package
 * metadata.
 *
 * @param {Parameters<typeof launch>[0]} [options]
 * @returns {{ npmVersion: string, coreVersion: string }}
 */
export function resolveVersions(options = {}) {
  const target = requireSupportedTarget(options.runtime ?? detectRuntime())
  const { npmVersion, coreVersion } = resolveValidatedPackage(target, options)
  return { npmVersion, coreVersion }
}

/**
 * @param {{ npmVersion: string, coreVersion: string }} versions
 * @returns {string}
 */
export function formatVersion({ npmVersion, coreVersion }) {
  return `spxa ${npmVersion} (core ${coreVersion})`
}

/**
 * Signals the parent forwards to the child while the child is running.
 *
 * When only the parent is interrupted (`kill -TERM <launcher-pid>`), the child
 * receives nothing, so the launcher forwards explicitly. Without that, the
 * native executable would be left running in the background.
 */
const FORWARDED_SIGNALS = /** @type {const} */ (["SIGINT", "SIGTERM"])

/**
 * @param {string} executable
 * @param {string[]} argv
 * @param {object} [options]
 * @param {typeof nodeSpawn} [options.spawn]
 * @param {NodeJS.ProcessEnv} [options.parentEnv]
 * @param {Pick<NodeJS.Process, "on" | "removeListener">} [options.parentProcess]
 * @returns {Promise<ChildStatus>}
 */
export function spawnNative(executable, argv, options = {}) {
  const spawn = options.spawn ?? nodeSpawn
  const parentEnv = options.parentEnv ?? process.env
  const parentProcess = options.parentProcess ?? process
  // The environment is inherited as-is: npm mode is a compile-time property of
  // the native executable, not a marker that could go missing.
  const child = spawn(executable, argv, {
    env: parentEnv,
    shell: false,
    stdio: "inherit",
  })

  return new Promise((resolve, reject) => {
    /** @type {[NodeJS.Signals, () => void][]} */
    const forwarders = []
    for (const signal of FORWARDED_SIGNALS) {
      const forward = () => {
        try {
          child.kill(signal)
        } catch {
          // The child is already gone: there is nothing left to forward to.
        }
      }
      forwarders.push([signal, forward])
      parentProcess.on(signal, forward)
    }

    let settled = false
    /** @param {() => void} finish */
    const settle = (finish) => {
      if (settled) {
        return
      }
      settled = true
      // Stop intercepting signals once the child is gone so the parent returns
      // to the default behaviour; that is what lets `applyChildStatus`
      // terminate this process with the same signal.
      for (const [signal, forward] of forwarders) {
        parentProcess.removeListener(signal, forward)
      }
      finish()
    }

    child.once("error", (error) => settle(() => reject(error)))
    child.once("exit", (code, signal) =>
      settle(() => resolve({ code, signal })),
    )
  })
}

/**
 * @param {ChildStatus} status
 * @param {object} [actions]
 * @param {(code: number) => void} [actions.setExitCode]
 * @param {(signal: NodeJS.Signals) => void} [actions.signalSelf]
 */
export function applyChildStatus(status, actions = {}) {
  const setExitCode =
    actions.setExitCode ??
    ((code) => {
      process.exitCode = code
    })
  const signalSelf =
    actions.signalSelf ?? ((signal) => process.kill(process.pid, signal))

  if (status.signal) {
    signalSelf(status.signal)
    return
  }

  setExitCode(status.code ?? 1)
}

/**
 * @param {Parameters<typeof launch>[0] & {
 *   writeOut?: (message: string) => void,
 *   writeError?: (message: string) => void,
 *   setExitCode?: (code: number) => void,
 *   signalSelf?: (signal: NodeJS.Signals) => void,
 * }} [options]
 */
export async function runCli(options = {}) {
  const writeOut = options.writeOut ?? ((message) => console.log(message))
  const writeError = options.writeError ?? ((message) => console.error(message))
  const setExitCode =
    options.setExitCode ??
    ((code) => {
      process.exitCode = code
    })
  const signalSelf =
    options.signalSelf ?? ((signal) => process.kill(process.pid, signal))

  const argv = options.argv ?? process.argv.slice(2)

  try {
    if (isTopLevelVersionRequest(argv)) {
      writeOut(formatVersion(resolveVersions(options)))
      setExitCode(0)
      return
    }
    applyChildStatus(await launch({ ...options, argv }), {
      setExitCode,
      signalSelf,
    })
  } catch (error) {
    writeError(formatLauncherError(error))
    setExitCode(1)
  }
}

/** @param {unknown} error */
export function formatLauncherError(error) {
  if (error instanceof SpxaLauncherError) {
    return `spxa [${error.code}]: ${error.message}`
  }

  return `spxa [${LAUNCHER_ERROR_CODES.launcherFailure}]: Launcher failed (${errorReason(error)}).`
}

/**
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {string} [options.arch]
 * @param {() => unknown} [options.getReport]
 * @returns {{ platform: string, arch: string, libc?: string }}
 */
export function detectRuntime(options = {}) {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  if (platform !== "linux") {
    return { platform, arch }
  }

  const getReport = options.getReport ?? (() => process.report?.getReport())
  const libc = detectLinuxLibc(getReport)
  return { platform, arch, ...(libc === undefined ? {} : { libc }) }
}

/**
 * Detect the Linux libc. glibc and musl each need positive evidence; when
 * neither is found this returns `undefined` so the runtime tuple reads
 * `unknown`.
 *
 * Unknown is not musl. Both are unsupported, but the diagnostic has to say what
 * was actually detected, otherwise the reader chases the wrong conclusion.
 *
 * @param {() => unknown} getReport
 * @returns {"glibc" | "musl" | undefined}
 */
export function detectLinuxLibc(getReport) {
  let report
  try {
    report = getReport()
  } catch {
    return undefined
  }
  if (typeof report !== "object" || report === null) {
    return undefined
  }

  const header =
    "header" in report &&
    typeof report.header === "object" &&
    report.header !== null
      ? /** @type {Record<string, unknown>} */ (report.header)
      : undefined
  if (
    typeof header?.glibcVersionRuntime === "string" &&
    header.glibcVersionRuntime.length > 0
  ) {
    return "glibc"
  }

  const sharedObjects =
    "sharedObjects" in report && Array.isArray(report.sharedObjects)
      ? report.sharedObjects
      : []
  if (
    sharedObjects.some(
      (entry) => typeof entry === "string" && entry.includes("ld-musl"),
    )
  ) {
    return "musl"
  }

  return undefined
}

/**
 * @typedef {{
 *   packageName: string,
 *   executable: string,
 *   npmVersion: string,
 *   coreVersion: string,
 * }} NativePackage
 */

/**
 * Resolve and validate the platform package, returning the absolute executable
 * path along with its version data.
 *
 * What gets validated is the package's own declared identity: name, version
 * (which must equal the launcher's npmVersion), executable filename, and
 * `spxa.coreVersion`. Any mismatch stops the run; no other executable is
 * substituted.
 *
 * @param {import("./target-registry.mjs").SpxaTarget} target
 * @param {object} [options]
 * @param {string} [options.launcherVersion]
 * @param {(packageName: string) => string} [options.resolvePackageManifestPath]
 * @param {(path: string | URL) => Record<string, unknown>} [options.readManifest]
 * @returns {NativePackage}
 */
export function resolveNativePackage(target, options = {}) {
  const loadManifest = options.readManifest ?? readManifest
  const launcherVersion =
    options.launcherVersion ??
    readLauncherVersion(
      loadManifest,
      new URL("./package.json", import.meta.url),
    )
  const resolvePackageManifestPath =
    options.resolvePackageManifestPath ??
    ((packageName) => require.resolve(`${packageName}/package.json`))

  let nativeManifestPath
  try {
    nativeManifestPath = resolvePackageManifestPath(target.packageName)
  } catch (error) {
    if (errorCode(error) === "MODULE_NOT_FOUND") {
      throw new SpxaLauncherError(
        LAUNCHER_ERROR_CODES.nativePackageMissing,
        `Optional native package "${target.packageName}@${launcherVersion}" is missing. ${reinstallHint(launcherVersion)}`,
        error,
      )
    }

    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativePackageResolutionFailed,
      `Failed to resolve native package "${target.packageName}@${launcherVersion}" (${errorReason(error)}). ${reinstallHint(launcherVersion)}`,
      error,
    )
  }

  let nativeManifest
  try {
    nativeManifest = loadManifest(nativeManifestPath)
  } catch (error) {
    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativePackageInvalid,
      `Could not read native package "${target.packageName}@${launcherVersion}" (${errorReason(error)}). ${reinstallHint(launcherVersion)}`,
      error,
    )
  }

  if (nativeManifest.version !== launcherVersion) {
    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativeVersionMismatch,
      `Native package "${target.packageName}@${String(nativeManifest.version)}" does not match launcher version "${launcherVersion}".`,
    )
  }

  if (nativeManifest.name !== target.packageName) {
    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativePackageInvalid,
      `Native package at "${nativeManifestPath}" declares name "${String(nativeManifest.name)}" instead of "${target.packageName}". ${reinstallHint(launcherVersion)}`,
    )
  }

  const metadata =
    typeof nativeManifest.spxa === "object" && nativeManifest.spxa !== null
      ? /** @type {Record<string, unknown>} */ (nativeManifest.spxa)
      : undefined
  const coreVersion = metadata?.coreVersion
  if (typeof coreVersion !== "string" || coreVersion.length === 0) {
    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativePackageInvalid,
      `Native package "${target.packageName}@${launcherVersion}" does not declare "spxa.coreVersion". ${reinstallHint(launcherVersion)}`,
    )
  }
  if (
    metadata?.executable !== undefined &&
    metadata.executable !== target.npmExecutableName
  ) {
    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativePackageInvalid,
      `Native package "${target.packageName}@${launcherVersion}" declares executable "${String(metadata.executable)}" instead of "${target.npmExecutableName}". ${reinstallHint(launcherVersion)}`,
    )
  }

  return Object.freeze({
    packageName: target.packageName,
    executable: join(dirname(nativeManifestPath), target.npmExecutableName),
    npmVersion: launcherVersion,
    coreVersion,
  })
}

/**
 * @param {(path: string | URL) => { version?: unknown }} loadManifest
 * @param {URL} launcherManifestPath
 */
function readLauncherVersion(loadManifest, launcherManifestPath) {
  let manifest
  try {
    manifest = loadManifest(launcherManifestPath)
  } catch (error) {
    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.launcherFailure,
      `Could not read the spxa launcher manifest (${errorReason(error)}).`,
      error,
    )
  }

  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.launcherFailure,
      "The spxa launcher manifest does not contain a valid version.",
    )
  }

  return manifest.version
}

/**
 * @param {import("./target-registry.mjs").SpxaTarget} target
 * @param {unknown} error
 */
function nativeSpawnError(target, error) {
  const code = errorCode(error)
  if (code === "ENOENT") {
    return new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativeExecutableMissing,
      `Executable "${target.npmExecutableName}" is missing from native package "${target.packageName}". ${reinstallHint()}`,
      error,
    )
  }
  if (code === "EACCES" || code === "EPERM") {
    return new SpxaLauncherError(
      LAUNCHER_ERROR_CODES.nativeExecutableNotExecutable,
      `Executable "${target.npmExecutableName}" from native package "${target.packageName}" is not executable (permission denied). Check its permissions or ${reinstallAction()}.`,
      error,
    )
  }

  return new SpxaLauncherError(
    LAUNCHER_ERROR_CODES.nativeSpawnFailed,
    `Failed to start executable "${target.npmExecutableName}" from native package "${target.packageName}" (${errorReason(error)}). ${capitalize(reinstallAction())} if the package is damaged.`,
    error,
  )
}

/** @param {string} [version] */
function reinstallHint(version) {
  return `${capitalize(reinstallAction(version))}.`
}

/** @param {string} [version] */
function reinstallAction(version) {
  const packageSpec = version ? `spxa@${version}` : "spxa"
  return `reinstall "${packageSpec}" without "--omit=optional"`
}

/** @param {string} value */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** @param {unknown} error */
function errorCode(error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code
  }
  return undefined
}

/** @param {unknown} error */
function errorReason(error) {
  const message = error instanceof Error ? error.message : String(error)
  const code = errorCode(error)
  return code ? `${code}: ${message}` : message
}

/** @param {string | URL} path */
function readManifest(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}
