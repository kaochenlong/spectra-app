import { EventEmitter } from "node:events"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  applyChildStatus,
  detectLinuxLibc,
  detectRuntime,
  launch,
  resolveNativePackage,
  runCli,
  spawnNative,
} from "./launcher.mjs"
import { TARGETS } from "./target-registry.mjs"

const tempRoots: string[] = []

/** Native package descriptor used for injection. */
function nativePackage(executable: string) {
  return {
    packageName: "@kaochenlong/spxa-darwin-arm64",
    executable,
    npmVersion: "0.1.0",
    coreVersion: "3.0.0",
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("spxa launcher", () => {
  it("passes argv including -- unchanged and leaves the environment alone", async () => {
    const root = tempRoot()
    const resultPath = join(root, "argv.json")
    const fixture = [
      "const { writeFileSync } = require('node:fs')",
      `writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({`,
      "  argv: process.argv.slice(1),",
      "  distribution: process.env.SPECTRA_CLI_DISTRIBUTION ?? null,",
      "}))",
    ].join("\n")
    const argv = ["-e", fixture, "first", "--", "second value"]

    const status = await launch({
      argv,
      runtime: { platform: "darwin", arch: "arm64" },
      resolvePackage: () => nativePackage(process.execPath),
    })

    expect(status).toEqual({ code: 0, signal: null })
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual({
      argv: ["first", "--", "second value"],
      distribution: null,
    })
  })

  it("returns a non-zero native exit code", async () => {
    const status = await launch({
      argv: ["-e", "process.exit(7)"],
      runtime: { platform: "win32", arch: "x64" },
      resolvePackage: () => nativePackage(process.execPath),
    })

    expect(status).toEqual({ code: 7, signal: null })
  })

  it.skipIf(process.platform === "win32")(
    "returns native signal termination",
    async () => {
      const status = await launch({
        argv: ["-e", "process.kill(process.pid, 'SIGTERM')"],
        runtime: { platform: "linux", arch: "x64", libc: "glibc" },
        resolvePackage: () => nativePackage(process.execPath),
      })

      expect(status).toEqual({ code: null, signal: "SIGTERM" })
    },
  )

  it("spawns without a shell using inherited stdio and the parent environment", async () => {
    const child = new EventEmitter()
    const spawn = vi.fn(() => child as any)
    const result = spawnNative("/fixture/spxa", ["status", "--json"], {
      spawn,
      parentEnv: { EXISTING: "kept" },
    })

    child.emit("exit", 0, null)

    await expect(result).resolves.toEqual({ code: 0, signal: null })
    expect(spawn).toHaveBeenCalledWith("/fixture/spxa", ["status", "--json"], {
      env: { EXISTING: "kept" },
      shell: false,
      stdio: "inherit",
    })
  })

  // Scenario: POSIX interruption reaches the child — listener lifetime
  it("forwards parent signals to the child and releases the listeners afterwards", async () => {
    const parentProcess = new EventEmitter()
    const child = new EventEmitter() as any
    child.kill = vi.fn()
    const spawn = vi.fn(() => child)

    const result = spawnNative("/fixture/spxa", [], {
      spawn,
      parentEnv: {},
      parentProcess,
    })

    expect(parentProcess.listenerCount("SIGINT")).toBe(1)
    expect(parentProcess.listenerCount("SIGTERM")).toBe(1)

    parentProcess.emit("SIGINT")
    expect(child.kill).toHaveBeenCalledWith("SIGINT")
    parentProcess.emit("SIGTERM")
    expect(child.kill).toHaveBeenCalledWith("SIGTERM")

    child.emit("exit", null, "SIGTERM")
    await expect(result).resolves.toEqual({ code: null, signal: "SIGTERM" })

    expect(parentProcess.listenerCount("SIGINT")).toBe(0)
    expect(parentProcess.listenerCount("SIGTERM")).toBe(0)
  })

  it("survives a child that is already gone when the signal arrives", async () => {
    const parentProcess = new EventEmitter()
    const child = new EventEmitter() as any
    child.kill = vi.fn(() => {
      throw Object.assign(new Error("no such process"), { code: "ESRCH" })
    })

    const result = spawnNative("/fixture/spxa", [], {
      spawn: () => child,
      parentEnv: {},
      parentProcess,
    })

    expect(() => parentProcess.emit("SIGTERM")).not.toThrow()

    child.emit("exit", 0, null)
    await expect(result).resolves.toEqual({ code: 0, signal: null })
    expect(parentProcess.listenerCount("SIGTERM")).toBe(0)
  })

  it("maps child exit and signal status to the launcher process", () => {
    const setExitCode = vi.fn()
    const signalSelf = vi.fn()

    applyChildStatus({ code: 9, signal: null }, { setExitCode, signalSelf })
    expect(setExitCode).toHaveBeenCalledWith(9)
    expect(signalSelf).not.toHaveBeenCalled()

    setExitCode.mockClear()
    applyChildStatus(
      { code: null, signal: "SIGTERM" },
      { setExitCode, signalSelf },
    )
    expect(signalSelf).toHaveBeenCalledWith("SIGTERM")
    expect(setExitCode).not.toHaveBeenCalled()
  })

  it("rejects unsupported runtime tuples before resolving or spawning", async () => {
    const resolvePackage = vi.fn()
    const spawn = vi.fn()

    const stderr = await captureFailure({
      runtime: { platform: "freebsd", arch: "x64" },
      resolvePackage,
      spawn,
    })

    expect(stderr).toMatchInlineSnapshot(
      `"spxa [SPXA_UNSUPPORTED_RUNTIME]: Unsupported runtime "freebsd-x64". Supported runtimes: darwin-arm64, darwin-x64, linux-arm64-glibc, linux-x64-glibc, win32-x64. Run spxa on one of them instead."`,
    )
    expect(resolvePackage).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it("rejects Linux musl before resolving or spawning", async () => {
    const resolvePackage = vi.fn()
    const spawn = vi.fn()

    const stderr = await captureFailure({
      runtime: { platform: "linux", arch: "x64", libc: "musl" },
      resolvePackage,
      spawn,
    })

    expect(stderr).toMatchInlineSnapshot(
      `"spxa [SPXA_UNSUPPORTED_RUNTIME]: Unsupported runtime "linux-x64-musl". Supported runtimes: darwin-arm64, darwin-x64, linux-arm64-glibc, linux-x64-glibc, win32-x64. Run spxa on one of them instead."`,
    )
    expect(resolvePackage).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it("reports a missing exact-version optional package with a reinstall hint", async () => {
    const missingPackage = nodeError(
      "MODULE_NOT_FOUND",
      "fixture package is absent",
    )
    const spawn = vi.fn()

    const stderr = await captureFailure({
      runtime: { platform: "darwin", arch: "arm64" },
      resolverOptions: {
        launcherVersion: "1.2.3",
        resolvePackageManifestPath: () => {
          throw missingPackage
        },
      },
      spawn,
    })

    expect(stderr).toMatchInlineSnapshot(
      `"spxa [SPXA_NATIVE_PACKAGE_MISSING]: Optional native package "@kaochenlong/spxa-darwin-arm64@1.2.3" is missing. Reinstall "spxa@1.2.3" without "--omit=optional"."`,
    )
    expect(spawn).not.toHaveBeenCalled()
  })

  it("reports a missing executable from the resolved package without fallback", async () => {
    const spawn = spawnFailure("ENOENT", "fixture executable is absent")
    const resolvePackage = vi.fn(() => nativePackage("/fixture/native/spxa"))

    const stderr = await captureFailure({
      runtime: { platform: "darwin", arch: "arm64" },
      resolvePackage,
      spawn,
    })

    expect(stderr).toMatchInlineSnapshot(
      `"spxa [SPXA_NATIVE_EXECUTABLE_MISSING]: Executable "spxa" is missing from native package "@kaochenlong/spxa-darwin-arm64". Reinstall "spxa" without "--omit=optional"."`,
    )
    expect(resolvePackage).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith(
      "/fixture/native/spxa",
      [],
      expect.objectContaining({ shell: false }),
    )
  })

  it("reports a non-executable package binary without fallback", async () => {
    const spawn = spawnFailure("EACCES", "fixture permission denied")
    const resolvePackage = vi.fn(() => nativePackage("/fixture/native/spxa"))

    const stderr = await captureFailure({
      runtime: { platform: "darwin", arch: "arm64" },
      resolvePackage,
      spawn,
    })

    expect(stderr).toMatchInlineSnapshot(
      `"spxa [SPXA_NATIVE_EXECUTABLE_NOT_EXECUTABLE]: Executable "spxa" from native package "@kaochenlong/spxa-darwin-arm64" is not executable (permission denied). Check its permissions or reinstall "spxa" without "--omit=optional"."`,
    )
    expect(resolvePackage).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it("reports other spawn failures with the resolved package and reason", async () => {
    const spawn = spawnFailure("EIO", "fixture I/O failure")
    const resolvePackage = vi.fn(() => nativePackage("/fixture/native/spxa"))

    const stderr = await captureFailure({
      runtime: { platform: "darwin", arch: "arm64" },
      resolvePackage,
      spawn,
    })

    expect(stderr).toMatchInlineSnapshot(
      `"spxa [SPXA_NATIVE_SPAWN_FAILED]: Failed to start executable "spxa" from native package "@kaochenlong/spxa-darwin-arm64" (EIO: fixture I/O failure). Reinstall "spxa" without "--omit=optional" if the package is damaged."`,
    )
    expect(resolvePackage).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  // Example: Exact dependency version
  it("reports an exact-version mismatch before spawning", async () => {
    const target = TARGETS[0]

    expect(() =>
      resolveNativePackage(target, {
        launcherVersion: "0.1.0",
        resolvePackageManifestPath: () => "/fixture/native/package.json",
        readManifest: () => ({
          name: target.packageName,
          version: "0.1.1",
          spxa: { coreVersion: "3.0.0" },
        }),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SPXA_NATIVE_VERSION_MISMATCH" }),
    )
  })

  it("rejects a native package whose identity or metadata does not match", () => {
    const target = TARGETS[0]
    const resolve = (manifest: Record<string, unknown>) =>
      resolveNativePackage(target, {
        launcherVersion: "0.1.0",
        resolvePackageManifestPath: () => "/fixture/native/package.json",
        readManifest: () => manifest,
      })

    // Name mismatch: a damaged or swapped package
    expect(() =>
      resolve({
        name: "@kaochenlong/spxa-win32-x64",
        version: "0.1.0",
        spxa: { coreVersion: "3.0.0" },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SPXA_NATIVE_PACKAGE_INVALID" }),
    )

    // Missing coreVersion: reporting "unknown" instead is not acceptable
    expect(() =>
      resolve({ name: target.packageName, version: "0.1.0" }),
    ).toThrowError(
      expect.objectContaining({ code: "SPXA_NATIVE_PACKAGE_INVALID" }),
    )
    expect(() =>
      resolve({
        name: target.packageName,
        version: "0.1.0",
        spxa: { coreVersion: "" },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SPXA_NATIVE_PACKAGE_INVALID" }),
    )

    // Executable filename mismatch
    expect(() =>
      resolve({
        name: target.packageName,
        version: "0.1.0",
        spxa: { coreVersion: "3.0.0", executable: "spectra" },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SPXA_NATIVE_PACKAGE_INVALID" }),
    )
  })

  it("resolves the executable inside the native package, never from PATH", () => {
    const target = TARGETS[0]
    const resolved = resolveNativePackage(target, {
      launcherVersion: "0.1.0",
      resolvePackageManifestPath: () =>
        "/fixture/node_modules/@kaochenlong/spxa-darwin-arm64/package.json",
      readManifest: () => ({
        name: target.packageName,
        version: "0.1.0",
        spxa: { coreVersion: "3.0.0", executable: target.npmExecutableName },
      }),
    })

    expect(resolved).toEqual({
      packageName: target.packageName,
      executable:
        "/fixture/node_modules/@kaochenlong/spxa-darwin-arm64/" +
        target.npmExecutableName,
      npmVersion: "0.1.0",
      coreVersion: "3.0.0",
    })
  })

  // Scenario: Unsupported or unknown runtime — an unknown libc is not reported as musl
  it("reports an unknown Linux libc as unknown rather than musl", async () => {
    expect(
      detectLinuxLibc(() => ({ header: { glibcVersionRuntime: "2.31" } })),
    ).toBe("glibc")
    expect(
      detectLinuxLibc(() => ({
        header: {},
        sharedObjects: ["/lib/ld-musl-x86_64.so.1"],
      })),
    ).toBe("musl")
    expect(
      detectLinuxLibc(() => ({ header: {}, sharedObjects: [] })),
    ).toBeUndefined()
    expect(
      detectLinuxLibc(() => {
        throw new Error("no report available")
      }),
    ).toBeUndefined()

    const unknownRuntime = detectRuntime({
      platform: "linux",
      arch: "x64",
      getReport: () => ({ header: {}, sharedObjects: [] }),
    })
    expect(unknownRuntime).toEqual({ platform: "linux", arch: "x64" })

    const resolvePackage = vi.fn()
    const spawn = vi.fn()
    const stderr = await captureFailure({
      runtime: unknownRuntime,
      resolvePackage,
      spawn,
    })
    expect(stderr).toContain('"linux-x64-unknown"')
    expect(stderr).not.toContain('musl"')
    expect(resolvePackage).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  // Scenario: Independent package and core versions
  it("answers the top-level --version from validated metadata", async () => {
    const writeOut = vi.fn()
    const setExitCode = vi.fn()
    const spawn = vi.fn()

    await runCli({
      argv: ["--version"],
      runtime: { platform: "darwin", arch: "arm64" },
      resolvePackage: () => ({
        packageName: "@kaochenlong/spxa-darwin-arm64",
        executable: "/fixture/native/spxa",
        npmVersion: "0.1.0",
        coreVersion: "3.0.0",
      }),
      spawn,
      writeOut,
      setExitCode,
    })

    expect(writeOut).toHaveBeenCalledWith("spxa 0.1.0 (core 3.0.0)")
    expect(setExitCode).toHaveBeenCalledWith(0)
    expect(spawn).not.toHaveBeenCalled()
  })

  it("passes every other argument vector through, including --version with args", async () => {
    for (const argv of [
      ["show", "--version"],
      ["--version", "--json"],
      ["-V"],
    ]) {
      const writeOut = vi.fn()
      const spawn = vi.fn(() => {
        const child = new EventEmitter()
        queueMicrotask(() => child.emit("exit", 0, null))
        return child as any
      })

      await runCli({
        argv,
        runtime: { platform: "darwin", arch: "arm64" },
        resolvePackage: () => nativePackage("/fixture/native/spxa"),
        spawn,
        writeOut,
        setExitCode: vi.fn(),
      })

      expect(writeOut, argv.join(" ")).not.toHaveBeenCalled()
      expect(spawn, argv.join(" ")).toHaveBeenCalledWith(
        "/fixture/native/spxa",
        argv,
        expect.objectContaining({ shell: false, stdio: "inherit" }),
      )
    }
  })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "spxa-launcher-"))
  tempRoots.push(root)
  writeFileSync(join(root, ".keep"), "")
  return root
}

async function captureFailure(
  options: Record<string, unknown>,
): Promise<string> {
  const stderr: string[] = []
  const exitCodes: number[] = []

  await runCli({
    ...options,
    writeError: (message: string) => stderr.push(message),
    setExitCode: (code: number) => exitCodes.push(code),
  })

  expect(exitCodes).toEqual([1])
  return stderr.join("\n")
}

function nodeError(code: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code })
}

function spawnFailure(code: string, message: string) {
  return vi.fn(() => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit("error", nodeError(code, message)))
    return child as any
  })
}
