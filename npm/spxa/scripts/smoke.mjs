/**
 * Install spxa from real tarballs and actually run it inside an isolated
 * prefix, project and npm cache.
 *
 * Two modes:
 *   --artifacts <dir>          Install offline from the tarballs pack.mjs
 *                              produced; spxa does not need to be published.
 *   --registry-install <spec>  Install a published version from the registry;
 *                              the publication tool uses this before promoting
 *                              latest.
 *
 * Every run puts a fake `spectra` first on PATH that leaves a sentinel behind
 * when executed. An npm-installed spxa must never run it, and that is exactly
 * what this checks.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { detectRuntime } from "../launcher.mjs"
import { resolveTarget } from "../target-registry.mjs"

export const PACK_REPORT_FILENAME = "pack-report.json"
export const SENTINEL_NAME = "path-spectra-was-executed"

export const HELP = `Install spxa from real tarballs and run it.

Usage:
  node scripts/smoke.mjs --artifacts <dir> [options]
  node scripts/smoke.mjs --registry-install <spec> [options]

Modes:
  --artifacts <dir>         Install the main and host platform tarballs from a
                            pack.mjs staging directory. Works offline and does
                            not require spxa to be published.
  --registry-install <spec> Install the given spec (for example spxa@next) from
                            the registry into an isolated prefix.

Options:
  --keep                    Keep the isolated directories for inspection.
  --help                    Print this message.

Every install runs in an isolated prefix, project and npm cache, with a fake
"spectra" first on PATH. The run fails if that fake is ever executed, if the
native executable changes, or if any checked command misbehaves.
`

export class SmokeError extends Error {}

function fail(message) {
  throw new SmokeError(message)
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

/** The isolated installation environment. */
export function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), "spxa-smoke-"))
  const sandbox = {
    root,
    prefix: join(root, "prefix"),
    cache: join(root, "cache"),
    project: join(root, "project"),
    fakeBin: join(root, "fake-bin"),
    home: join(root, "home"),
    sentinel: join(root, SENTINEL_NAME),
  }
  for (const directory of [
    sandbox.prefix,
    sandbox.cache,
    sandbox.project,
    sandbox.fakeBin,
    sandbox.home,
  ]) {
    mkdirSync(directory, { recursive: true })
  }

  // The fake spectra on PATH: executing it leaves a sentinel behind.
  const fakeSpectra = join(sandbox.fakeBin, "spectra")
  writeFileSync(
    fakeSpectra,
    `#!/bin/sh\ntouch ${JSON.stringify(sandbox.sentinel)}\nexit 0\n`,
  )
  chmodSync(fakeSpectra, 0o755)

  writeFileSync(
    join(sandbox.project, "package.json"),
    `${JSON.stringify({ name: "spxa-smoke-project", private: true }, null, 2)}\n`,
  )

  return sandbox
}

function sandboxEnvironment(sandbox) {
  return {
    ...process.env,
    PATH: `${sandbox.fakeBin}:${process.env.PATH ?? ""}`,
    HOME: sandbox.home,
    npm_config_cache: sandbox.cache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  }
}

function run(command, args, { sandbox, cwd, allowFailure = false }) {
  const result = spawnSync(command, args, {
    cwd: cwd ?? sandbox.project,
    env: sandboxEnvironment(sandbox),
    encoding: "utf8",
  })
  if (result.error) {
    fail(
      `${command} ${args.join(" ")} could not start: ${result.error.message}`,
    )
  }
  if (!allowFailure && result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} exited ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    )
  }
  return result
}

export function readPackReport(artifactsDirectory) {
  const reportPath = join(artifactsDirectory, PACK_REPORT_FILENAME)
  if (!existsSync(reportPath)) {
    fail(
      `No ${PACK_REPORT_FILENAME} in ${artifactsDirectory}. Point --artifacts at a directory produced by scripts/pack.mjs.`,
    )
  }
  return JSON.parse(readFileSync(reportPath, "utf8"))
}

/** The platform tarball for this host, along with the main package tarball. */
export function selectHostTarballs(artifactsDirectory, report, runtime) {
  const target = resolveTarget(runtime)
  if (!target) {
    fail(
      `This host (${runtime.platform}-${runtime.arch}${runtime.libc ? `-${runtime.libc}` : ""}) is not a supported runtime, so it cannot verify an install.`,
    )
  }

  const main = report.packages.find((entry) => entry.name === "spxa")
  const native = report.packages.find(
    (entry) => entry.name === target.packageName,
  )
  if (!main) {
    fail(`The pack report has no spxa main package.`)
  }
  if (!native) {
    fail(
      `The delivery has no ${target.packageName} tarball, so this host cannot be verified. Pack a delivery that includes ${target.rustTarget}.`,
    )
  }

  for (const entry of [main, native]) {
    const tarball = join(artifactsDirectory, entry.tarball)
    if (!existsSync(tarball)) {
      fail(`${entry.name} is missing its tarball at ${entry.tarball}.`)
    }
  }

  return {
    target,
    npmVersion: report.npmVersion,
    main: join(artifactsDirectory, main.tarball),
    native: join(artifactsDirectory, native.tarball),
  }
}

/** Where the native executable lands after an install. */
function nativeExecutablePath(installRoot, target) {
  return join(
    installRoot,
    "node_modules",
    ...target.packageName.split("/"),
    target.npmExecutableName,
  )
}

/**
 * Run the full set of checks against one installed spxa.
 *
 * @param {(args: string[], options?: { allowFailure?: boolean, cwd?: string }) => ReturnType<typeof spawnSync>} invoke
 */
export function checkInstalledCli(
  invoke,
  { projectDirectory, label, npmVersion },
) {
  const checks = []

  const help = invoke(["--help"])
  if (!help.stdout.includes("Usage: spxa")) {
    fail(`${label}: --help did not print spxa usage\n${help.stdout}`)
  }
  checks.push("--help")

  const version = invoke(["--version"])
  const versionMatch = version.stdout
    .trim()
    .match(/^spxa (\S+) \(core (\S+)\)$/)
  if (!versionMatch) {
    fail(
      `${label}: --version did not report the npm and core versions: ${version.stdout.trim()}`,
    )
  }
  if (versionMatch[1] !== npmVersion) {
    fail(
      `${label}: --version reported npmVersion ${versionMatch[1]} instead of ${npmVersion}`,
    )
  }
  checks.push(`--version (core ${versionMatch[2]})`)

  mkdirSync(projectDirectory, { recursive: true })
  invoke(["init", ".", "--tools", "claude"], { cwd: projectDirectory })
  const config = readFileSync(join(projectDirectory, ".spectra.yaml"), "utf8")
  if (!config.includes("cli_command: spxa")) {
    fail(`${label}: init did not record cli_command: spxa\n${config}`)
  }
  const skill = readFileSync(
    join(projectDirectory, ".claude/skills/spectra-apply/SKILL.md"),
    "utf8",
  )
  if (!skill.includes("spxa instructions")) {
    fail(`${label}: generated skills do not call spxa`)
  }
  if (/(^|[^-\w])spectra [a-z]/.test(skill)) {
    fail(
      `${label}: generated skills still tell the user to run a spectra subcommand`,
    )
  }
  checks.push("init")

  invoke(["update", "."], { cwd: projectDirectory })
  checks.push("update")

  for (const args of [
    ["decisions", "spxa", "--json"],
    ["list", "--json"],
  ]) {
    const result = invoke(args, { cwd: projectDirectory })
    try {
      JSON.parse(result.stdout)
    } catch {
      fail(
        `${label}: ${args.join(" ")} did not print handler JSON on stdout: ${result.stdout}`,
      )
    }
    checks.push(args.join(" "))
  }

  // scope needs a git working tree. node_modules stays out of it: what matters
  // is the project's own files, not the installed dependency tree.
  writeFileSync(join(projectDirectory, ".gitignore"), "node_modules/\n")
  execFileSync("git", ["init", "--quiet"], { cwd: projectDirectory })
  execFileSync("git", ["add", "-A"], { cwd: projectDirectory })
  execFileSync(
    "git",
    [
      "-c",
      "user.email=smoke@example.com",
      "-c",
      "user.name=smoke",
      "commit",
      "--quiet",
      "-m",
      "smoke",
    ],
    { cwd: projectDirectory },
  )
  const scope = invoke(["scope", "--json"], { cwd: projectDirectory })
  try {
    JSON.parse(scope.stdout)
  } catch {
    fail(`${label}: scope --json did not print handler JSON: ${scope.stdout}`)
  }
  checks.push("scope --json")

  return checks
}

/** self-update has to exit 1, point at npm, and leave the native executable untouched. */
export function checkSelfUpdateLeavesTheBinary(invoke, executablePath, label) {
  if (!existsSync(executablePath)) {
    fail(`${label}: no native executable at ${executablePath}`)
  }
  const before = sha256File(executablePath)
  const result = invoke(["self-update"], { allowFailure: true })

  if (result.status !== 1) {
    fail(`${label}: self-update exited ${result.status}, expected 1`)
  }
  if (!result.stderr.includes("npm install -g spxa@latest")) {
    fail(`${label}: self-update did not point at npm: ${result.stderr}`)
  }
  const after = sha256File(executablePath)
  if (before !== after) {
    fail(`${label}: self-update replaced the native executable`)
  }
  return { sha256: before }
}

/** Fail when a `spectra` found on PATH was executed during the run. */
export function assertNoPathFallback(sandbox) {
  if (existsSync(sandbox.sentinel)) {
    fail(
      "a `spectra` found on PATH was executed. The npm distribution must never fall back to another CLI.",
    )
  }
}

/** Offline mode: install from pack.mjs tarballs and verify. */
export function smokeFromArtifacts(artifactsDirectory, options = {}) {
  const artifacts = resolve(artifactsDirectory)
  const report = readPackReport(artifacts)
  const runtime = options.runtime ?? detectRuntime()
  const { target, npmVersion, main, native } = selectHostTarballs(
    artifacts,
    report,
    runtime,
  )

  const sandbox = createSandbox()
  const results = []

  try {
    // --- Global install. --ignore-scripts proves no install-time downloader
    // --- is required.
    run(
      "npm",
      [
        "install",
        "--global",
        "--prefix",
        sandbox.prefix,
        "--ignore-scripts",
        native,
        main,
      ],
      { sandbox },
    )
    const globalExecutable = join(sandbox.prefix, "bin", "spxa")
    if (!existsSync(globalExecutable)) {
      fail(`A global install produced no ${globalExecutable}.`)
    }
    const globalInvoke = (args, invokeOptions = {}) =>
      run(globalExecutable, args, { sandbox, ...invokeOptions })
    results.push({
      install: "global --ignore-scripts",
      checks: checkInstalledCli(globalInvoke, {
        projectDirectory: join(sandbox.root, "global-project"),
        label: "global",
        npmVersion,
      }),
      selfUpdate: checkSelfUpdateLeavesTheBinary(
        globalInvoke,
        nativeExecutablePath(join(sandbox.prefix, "lib"), target),
        "global",
      ),
    })

    // --- Project dependency plus npm exec, the one-time npx-style path.
    run("npm", ["install", "--ignore-scripts", "--save-dev", native, main], {
      sandbox,
    })
    const projectInvoke = (args, invokeOptions = {}) =>
      run("npm", ["exec", "--offline", "--", "spxa", ...args], {
        sandbox,
        ...invokeOptions,
      })
    results.push({
      install: "project dependency via npm exec",
      checks: checkInstalledCli(projectInvoke, {
        projectDirectory: sandbox.project,
        label: "project",
        npmVersion,
      }),
      selfUpdate: checkSelfUpdateLeavesTheBinary(
        projectInvoke,
        nativeExecutablePath(sandbox.project, target),
        "project",
      ),
    })

    assertNoPathFallback(sandbox)

    return {
      npmVersion,
      runtimeTuple: target.runtimeTuple,
      coreVersion: report.coreVersion,
      installs: results,
      sandbox: options.keep ? sandbox.root : undefined,
    }
  } finally {
    if (!options.keep) {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  }
}

/** Registry mode: the publication tool uses this to confirm a real install works before promoting latest. */
export function smokeFromRegistry(spec, options = {}) {
  const sandbox = createSandbox()
  try {
    const args = ["install", "--global", "--prefix", sandbox.prefix, spec]
    if (options.registry) {
      args.push("--registry", options.registry)
    }
    run("npm", args, { sandbox })

    const executable = join(sandbox.prefix, "bin", "spxa")
    if (!existsSync(executable)) {
      fail(`Installing ${spec} produced no ${executable}.`)
    }
    const invoke = (invokeArgs, invokeOptions = {}) =>
      run(executable, invokeArgs, { sandbox, ...invokeOptions })

    const version = invoke(["--version"])
    if (!/^spxa \S+ \(core \S+\)$/.test(version.stdout.trim())) {
      fail(
        `Installing ${spec} produced a launcher that cannot report its versions: ${version.stdout.trim()}`,
      )
    }
    invoke(["--help"])
    assertNoPathFallback(sandbox)

    return { spec, version: version.stdout.trim() }
  } finally {
    if (!options.keep) {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
  }
}

export function parseArguments(argv) {
  const options = { keep: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = () => {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith("--")) {
        fail(`${argument} needs a value. Run with --help for the full usage.`)
      }
      index += 1
      return next
    }

    switch (argument) {
      case "--help":
      case "-h":
        return "help"
      case "--artifacts":
        options.artifacts = value()
        break
      case "--registry-install":
        options.registryInstall = value()
        break
      case "--registry":
        options.registry = value()
        break
      case "--keep":
        options.keep = true
        break
      default:
        fail(`Unknown argument "${argument}". Run with --help for the usage.`)
    }
  }

  if (!options.artifacts && !options.registryInstall) {
    fail(
      "Pass --artifacts <dir> or --registry-install <spec>. Run with --help for the full usage.",
    )
  }
  if (options.artifacts && options.registryInstall) {
    fail("--artifacts and --registry-install are separate modes; pass one.")
  }

  return options
}

export function main(argv) {
  try {
    const options = parseArguments(argv)
    if (options === "help") {
      process.stdout.write(HELP)
      return 0
    }

    if (options.registryInstall) {
      const result = smokeFromRegistry(options.registryInstall, options)
      process.stdout.write(`registry install verified: ${result.version}\n`)
      return 0
    }

    const result = smokeFromArtifacts(options.artifacts, options)
    process.stdout.write(
      `host install verified on ${result.runtimeTuple}: spxa ${result.npmVersion} (core ${result.coreVersion})\n`,
    )
    for (const install of result.installs) {
      process.stdout.write(
        `  ${install.install}: ${install.checks.join(", ")}; self-update left the executable at ${install.selfUpdate.sha256.slice(0, 12)}…\n`,
      )
    }
    process.stdout.write("  no `spectra` from PATH was executed\n")
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`smoke.mjs: ${message}\n`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2))
}
