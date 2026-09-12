/**
 * Build the spxa npm tarballs (main package plus five platform packages) from
 * one explicit Rust delivery.
 *
 * `--artifacts` is the only Rust input: this script never compiles, never
 * downloads, and never fills in a missing platform from somewhere else. Every
 * tarball is actually unpacked and checked against an allowlist afterwards —
 * proprietary Rust source, Cargo trees, Git metadata, specification artifacts,
 * paths that escape the package, and symlinks are all rejected.
 *
 * Usage: node scripts/pack.mjs --artifacts <dir> --output <dir> [--version <semver>]
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"

import { SPXA_PACKAGE } from "../package-metadata.mjs"
import {
  TARGETS,
  createOptionalDependencies,
  isExactVersion,
} from "../target-registry.mjs"

export const MANIFEST_FILENAME = "manifest.json"
export const MANIFEST_SCHEMA_VERSION = 1
export const PACK_REPORT_FILENAME = "pack-report.json"

/** Files allowed in the main tarball, with the `package/` prefix stripped. */
export const MAIN_PACKAGE_ALLOWLIST = Object.freeze([
  "LICENSE",
  "README.md",
  "bin/spxa.mjs",
  "launcher.mjs",
  "package-metadata.mjs",
  "package.json",
  "target-registry.mjs",
])

/** Files allowed in a platform tarball; the executable name depends on the target. */
export function nativePackageAllowlist(executableName) {
  return Object.freeze(
    ["LICENSE", "THIRD_PARTY_NOTICES", "package.json", executableName].sort(),
  )
}

export const HELP = `Pack the spxa npm tarballs from a verified Rust delivery.

Usage:
  node scripts/pack.mjs --artifacts <dir> --output <dir> [options]

Required values:
  --artifacts <dir>   Delivery directory produced by the private export script.
                      It is the only Rust input; nothing is downloaded.
  --output <dir>      Staging directory to create. It must not already contain
                      files; remove it first.

Options:
  --version <semver>  Expected npmVersion. When given it must match the
                      delivery manifest exactly.
  --development       Allow a delivery marked dirty. The pack report records it
                      so publishing refuses the result.
  --help              Print this message.

Failures and how to correct them:
  incomplete matrix   Re-export the delivery with every target.
  checksum mismatch   Re-export the delivery; do not patch files by hand.
  dirty delivery      Re-export from committed sources, or pass --development
                      for a local verification pack.
  non-empty output    Remove the --output directory and run again.
`

export class PackError extends Error {}

function fail(message) {
  throw new PackError(message)
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

/**
 * Reject escaping paths, absolute paths, and entries outside the allowlist.
 * Missing required files are rejected too.
 *
 * @param {string[]} paths tarball paths with the `package/` prefix stripped
 * @param {readonly string[]} allowlist
 * @param {string} label
 */
export function assertAllowedPaths(paths, allowlist, label) {
  const allowed = new Set(allowlist)
  const seen = new Set()

  for (const path of paths) {
    if (path.length === 0) {
      continue
    }
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) {
      fail(`${label} contains an absolute path: ${path}`)
    }
    if (path.split(/[\\/]/).includes("..")) {
      fail(`${label} contains a path that escapes the package: ${path}`)
    }
    if (!allowed.has(path)) {
      fail(
        `${label} contains an unexpected entry: ${path}. Only these are allowed: ${allowlist.join(", ")}.`,
      )
    }
    seen.add(path)
  }

  for (const required of allowlist) {
    if (!seen.has(required)) {
      fail(`${label} is missing ${required}.`)
    }
  }
}

/** The entries inside a tarball, with the `package/` prefix stripped. */
export function listTarball(tarballPath) {
  const listing = execFileSync("tar", ["-tzf", tarballPath], {
    encoding: "utf8",
  })
  return listing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith("/"))
    .map((line) => line.replace(/^package\//, ""))
}

/**
 * Unpack a tarball and confirm every entry is a regular file — no symlinks, no
 * device nodes.
 *
 * Names are checked before anything is unpacked, so an escaping path is
 * rejected before it can reach the disk.
 */
export function inspectTarball(tarballPath, allowlist, label) {
  const names = listTarball(tarballPath)
  assertAllowedPaths(names, allowlist, label)

  const sandbox = mkdtempSync(join(tmpdir(), "spxa-unpack-"))
  try {
    execFileSync("tar", ["-xzf", tarballPath, "-C", sandbox])
    const unpacked = join(sandbox, "package")
    const found = []
    const pending = [unpacked]
    while (pending.length > 0) {
      const directory = pending.pop()
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry)
        const stats = lstatSync(path)
        if (stats.isSymbolicLink()) {
          fail(
            `${label} contains a symbolic link: ${relative(unpacked, path)}. Packages must carry real files only.`,
          )
        }
        if (stats.isDirectory()) {
          pending.push(path)
          continue
        }
        if (!stats.isFile()) {
          fail(
            `${label} contains a non-regular entry: ${relative(unpacked, path)}.`,
          )
        }
        found.push(relative(unpacked, path).split("\\").join("/"))
      }
    }
    assertAllowedPaths(found.sort(), allowlist, `${label} (unpacked)`)
    return found.sort()
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
}

export function readDeliveryManifest(artifactsDirectory) {
  const manifestPath = join(artifactsDirectory, MANIFEST_FILENAME)
  if (!existsSync(manifestPath)) {
    fail(
      `No ${MANIFEST_FILENAME} in ${artifactsDirectory}. Point --artifacts at an exported delivery directory.`,
    )
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    fail(
      `${manifestPath} has schemaVersion ${manifest.schemaVersion}; this packer reads ${MANIFEST_SCHEMA_VERSION}.`,
    )
  }
  return manifest
}

/**
 * Verify the delivery item by item: matrix, version, checksums, compatibility,
 * and source identity.
 *
 * @param {string} artifactsDirectory
 * @param {{ expectedVersion?: string, development?: boolean }} [options]
 */
export function verifyDelivery(artifactsDirectory, options = {}) {
  const manifest = readDeliveryManifest(artifactsDirectory)

  if (!isExactVersion(manifest.npmVersion)) {
    fail(
      `The delivery manifest records npmVersion ${JSON.stringify(manifest.npmVersion)}, which is not an exact SemVer version.`,
    )
  }
  if (
    options.expectedVersion &&
    options.expectedVersion !== manifest.npmVersion
  ) {
    fail(
      `--version ${options.expectedVersion} does not match the delivery's npmVersion ${manifest.npmVersion}. Refusing to pack a mixed release.`,
    )
  }
  if (manifest.dirty && !options.development) {
    fail(
      `The delivery at ${artifactsDirectory} is marked dirty. Re-export it from committed sources, or pass --development for a local verification pack.`,
    )
  }
  if (!manifest.coreVersion || !manifest.coreRevision) {
    fail(
      `The delivery at ${artifactsDirectory} does not record a core identity (coreVersion and coreRevision).`,
    )
  }

  const delivered = new Map(
    (manifest.targets ?? []).map((entry) => [entry.rustTarget, entry]),
  )
  for (const target of TARGETS) {
    const entry = delivered.get(target.rustTarget)
    if (!entry) {
      if (options.development) {
        // A development pack may cover only the host platform. The report
        // records the gap so publishing refuses the result.
        continue
      }
      fail(
        `The delivery is missing ${target.rustTarget} (${target.packageName}). Re-export it with every target; a platform is never filled in from elsewhere.`,
      )
    }
    if (entry.packageName !== target.packageName) {
      fail(
        `${target.rustTarget} is delivered as ${entry.packageName} but the registry names it ${target.packageName}.`,
      )
    }
    if (entry.runtimeTuple !== target.runtimeTuple) {
      fail(
        `${target.rustTarget} is delivered as runtime ${entry.runtimeTuple} but the registry names it ${target.runtimeTuple}.`,
      )
    }
    if (!entry.builderIdentity) {
      fail(`${target.rustTarget} has no builderIdentity in the delivery.`)
    }
    if (!entry.minimumRuntime?.os) {
      fail(
        `${target.rustTarget} does not declare a minimum runtime in the delivery.`,
      )
    }

    const binaryPath = join(artifactsDirectory, entry.binary)
    if (!existsSync(binaryPath)) {
      fail(`The delivery is missing the binary ${entry.binary}.`)
    }
    const actual = sha256File(binaryPath)
    if (actual !== entry.sha256) {
      fail(
        `Checksum mismatch for ${entry.binary}: the manifest says ${entry.sha256}, the file is ${actual}. Re-export the delivery.`,
      )
    }
    if (basename(entry.binary) !== target.npmExecutableName) {
      fail(
        `${entry.binary} is not named ${target.npmExecutableName} as the registry requires.`,
      )
    }
  }

  if (delivered.size !== TARGETS.length && !options.development) {
    fail(
      `The delivery has ${delivered.size} targets but the registry declares ${TARGETS.length}.`,
    )
  }

  for (const notice of manifest.notices ?? []) {
    const noticePath = join(artifactsDirectory, "notices", notice.file)
    if (!existsSync(noticePath) || sha256File(noticePath) !== notice.sha256) {
      fail(
        `Notice ${notice.file} is missing from the delivery or does not match its checksum.`,
      )
    }
  }
  for (const required of ["LICENSE", "THIRD_PARTY_NOTICES"]) {
    if (!(manifest.notices ?? []).some((notice) => notice.file === required)) {
      fail(
        `The delivery does not carry the native ${required}. Every platform package must ship it.`,
      )
    }
  }

  const declared = Object.keys(SPXA_PACKAGE.optionalDependencies ?? {}).sort()
  const expected = TARGETS.map((target) => target.packageName).sort()
  if (declared.join(",") !== expected.join(",")) {
    fail(
      `The launcher package.json declares optionalDependencies ${declared.join(", ")} but the registry declares ${expected.join(", ")}.`,
    )
  }

  return manifest
}

function requireEmptyOutput(output) {
  if (existsSync(output) && readdirSync(output).length > 0) {
    fail(
      `The output directory ${output} already contains files. Remove it and run again so no stale staging content is packed.`,
    )
  }
}

function stageMainPackage(launcherRoot, stagingRoot, npmVersion) {
  const directory = join(stagingRoot, "main")
  mkdirSync(directory, { recursive: true })

  for (const file of MAIN_PACKAGE_ALLOWLIST) {
    if (file === "package.json") {
      continue
    }
    const source = join(launcherRoot, file)
    if (!existsSync(source)) {
      fail(`The launcher checkout is missing ${file}.`)
    }
    const destination = join(directory, file)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(source, destination)
  }

  const manifest = {
    ...SPXA_PACKAGE,
    version: npmVersion,
    optionalDependencies: createOptionalDependencies(npmVersion),
  }
  delete manifest.devDependencies
  delete manifest.scripts
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  return directory
}

function stageNativePackage({
  artifactsDirectory,
  stagingRoot,
  npmVersion,
  manifest,
  target,
  entry,
}) {
  const directory = join(stagingRoot, "native", target.runtimeTuple)
  mkdirSync(directory, { recursive: true })

  const executable = join(directory, target.npmExecutableName)
  copyFileSync(join(artifactsDirectory, entry.binary), executable)
  chmodSync(executable, 0o755)

  for (const notice of ["LICENSE", "THIRD_PARTY_NOTICES"]) {
    copyFileSync(
      join(artifactsDirectory, "notices", notice),
      join(directory, notice),
    )
  }

  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: target.packageName,
        version: npmVersion,
        description: `Native ${target.runtimeTuple} executable for the spxa CLI`,
        license: "SEE LICENSE IN LICENSE",
        os: [target.os],
        cpu: [target.cpu],
        ...(target.libc ? { libc: [target.libc] } : {}),
        engines: SPXA_PACKAGE.engines,
        repository: SPXA_PACKAGE.repository,
        homepage: SPXA_PACKAGE.homepage,
        bugs: SPXA_PACKAGE.bugs,
        files: nativePackageAllowlist(target.npmExecutableName).filter(
          (file) => file !== "package.json",
        ),
        spxa: {
          coreVersion: manifest.coreVersion,
          coreRevision: manifest.coreRevision,
          rustTarget: target.rustTarget,
          runtimeTuple: target.runtimeTuple,
          executable: target.npmExecutableName,
          sha256: entry.sha256,
          builderIdentity: entry.builderIdentity,
          minimumRuntime: entry.minimumRuntime,
        },
      },
      null,
      2,
    )}\n`,
  )

  return directory
}

function packDirectory(packageDirectory, destination, runNpmPack) {
  mkdirSync(destination, { recursive: true })
  const output = runNpmPack(packageDirectory, destination)
  const tarball = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tgz"))
    .pop()
  if (!tarball) {
    fail(`npm pack produced no tarball for ${packageDirectory}.`)
  }
  const tarballPath = join(destination, basename(tarball))
  if (!existsSync(tarballPath)) {
    fail(`npm pack reported ${tarball} but it is not in ${destination}.`)
  }
  return tarballPath
}

const defaultRunNpmPack = (packageDirectory, destination) =>
  execFileSync("npm", ["pack", "--silent", "--pack-destination", destination], {
    cwd: packageDirectory,
    encoding: "utf8",
  })

/**
 * @param {{
 *   artifacts: string,
 *   output: string,
 *   version?: string,
 *   development?: boolean,
 *   launcherRoot?: string,
 * }} options
 * @param {{ runNpmPack?: typeof defaultRunNpmPack }} [dependencies]
 */
export function pack(options, dependencies = {}) {
  const runNpmPack = dependencies.runNpmPack ?? defaultRunNpmPack
  const launcherRoot = resolve(
    options.launcherRoot ?? join(import.meta.dirname, ".."),
  )
  const artifacts = resolve(options.artifacts)
  const output = resolve(options.output)

  requireEmptyOutput(output)
  const manifest = verifyDelivery(artifacts, {
    expectedVersion: options.version,
    development: options.development,
  })
  const npmVersion = manifest.npmVersion

  const stagingRoot = join(output, "staging")
  const tarballDirectory = join(output, "tarballs")
  mkdirSync(stagingRoot, { recursive: true })

  const packages = []

  const mainDirectory = stageMainPackage(launcherRoot, stagingRoot, npmVersion)
  const mainTarball = packDirectory(mainDirectory, tarballDirectory, runNpmPack)
  inspectTarball(
    mainTarball,
    MAIN_PACKAGE_ALLOWLIST,
    `${SPXA_PACKAGE.name}@${npmVersion}`,
  )
  packages.push({
    name: SPXA_PACKAGE.name,
    version: npmVersion,
    tarball: relative(output, mainTarball),
    sha256: sha256File(mainTarball),
  })

  for (const target of TARGETS) {
    const entry = manifest.targets.find(
      (candidate) => candidate.rustTarget === target.rustTarget,
    )
    if (!entry) {
      // Only reachable for a development pack; verifyDelivery requires the
      // full matrix for a release.
      continue
    }
    const directory = stageNativePackage({
      artifactsDirectory: artifacts,
      stagingRoot,
      npmVersion,
      manifest,
      target,
      entry,
    })
    const tarball = packDirectory(directory, tarballDirectory, runNpmPack)
    inspectTarball(
      tarball,
      nativePackageAllowlist(target.npmExecutableName),
      `${target.packageName}@${npmVersion}`,
    )
    packages.push({
      name: target.packageName,
      version: npmVersion,
      runtimeTuple: target.runtimeTuple,
      tarball: relative(output, tarball),
      sha256: sha256File(tarball),
    })
  }

  const platformCount = packages.length - 1
  const report = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    npmVersion,
    coreVersion: manifest.coreVersion,
    coreRevision: manifest.coreRevision,
    launcherRevision: manifest.launcherRevision,
    dirty: Boolean(manifest.dirty),
    // A release needs every platform. A host-only development pack is usable
    // for local install verification but never for publication.
    complete: platformCount === TARGETS.length,
    packages,
  }
  writeFileSync(
    join(output, PACK_REPORT_FILENAME),
    `${JSON.stringify(report, null, 2)}\n`,
  )

  return report
}

export function parseArguments(argv) {
  const options = { artifacts: "", output: "", development: false }

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
      case "--output":
        options.output = value()
        break
      case "--version":
        options.version = value()
        break
      case "--development":
        options.development = true
        break
      default:
        fail(`Unknown argument "${argument}". Run with --help for the usage.`)
    }
  }

  for (const [name, provided] of [
    ["--artifacts", options.artifacts],
    ["--output", options.output],
  ]) {
    if (!provided) {
      fail(`${name} is required. Run with --help for the full usage.`)
    }
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
    const report = pack(options)
    process.stdout.write(
      `Packed ${report.packages.length} tarball(s) for spxa ${report.npmVersion} (core ${report.coreVersion})` +
        `${report.dirty ? " [dirty local pack]" : ""}\n`,
    )
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`pack.mjs: ${message}\n`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2))
}
