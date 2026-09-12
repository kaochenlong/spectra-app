/**
 * Publish the spxa npm packages in a fixed order: every platform package
 * first, then the main package to `next`, and only after the registry install
 * smoke check passes is the main package promoted to `latest`.
 *
 * This tool touches the npm registry and nothing else. It never creates a
 * GitHub Release, never modifies the desktop R2 manifest, and never changes the
 * legacy specx download channel — those channels are independent and this
 * script has no entry point into them.
 *
 * A failure leaves a retryable plan behind: versions already published with
 * identical integrity are skipped, conflicting content stops the run. Nothing
 * is unpublished, no published version is overwritten, and an existing latest
 * tag is never moved.
 *
 * Usage: node scripts/publish.mjs --artifacts <dir> [--tag next|latest] [--dry-run]
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { TARGETS } from "../target-registry.mjs"

export const PACK_REPORT_FILENAME = "pack-report.json"
export const PUBLISH_TAGS = Object.freeze(["next", "latest"])
export const MAIN_PACKAGE_NAME = "spxa"

export const HELP = `Publish the spxa npm packages in order.

Usage:
  node scripts/publish.mjs --artifacts <dir> [options]

Required values:
  --artifacts <dir>   Staging directory produced by scripts/pack.mjs. It must
                      contain ${PACK_REPORT_FILENAME} and the tarballs.

Options:
  --tag next|latest   Dist-tag to end on. Default: next. "latest" still goes
                      through next and the registry smoke check first.
  --dry-run           Verify the local artifacts and print the plan. Nothing is
                      authenticated, published, tagged or installed.
  --help              Print this message.

Order:
  1. every platform package, then
  2. spxa@next, then
  3. a registry installation smoke check, then
  4. the latest dist-tag (only with --tag latest).

This tool never creates a GitHub Release, never touches the desktop R2 manifest
and never changes the legacy specx channel. Tag the release yourself as
spxa-v<version> if you want the traceability.
`

export class PublishError extends Error {}

function fail(message) {
  throw new PublishError(message)
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
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

/**
 * Work out the plan for this release from local content only.
 *
 * @param {string} artifactsDirectory
 * @param {"next" | "latest"} tag
 */
export function createPlan(artifactsDirectory, tag) {
  if (!PUBLISH_TAGS.includes(tag)) {
    fail(
      `--tag "${tag}" is not supported. Use one of: ${PUBLISH_TAGS.join(", ")}.`,
    )
  }

  const artifacts = resolve(artifactsDirectory)
  const report = readPackReport(artifacts)

  if (report.dirty) {
    fail(
      `${join(artifacts, PACK_REPORT_FILENAME)} is marked dirty. Re-export and re-pack from committed sources before publishing.`,
    )
  }
  if (!report.npmVersion || !report.coreVersion) {
    fail(
      `${join(artifacts, PACK_REPORT_FILENAME)} does not record the npm and core versions.`,
    )
  }

  const byName = new Map(
    (report.packages ?? []).map((entry) => [entry.name, entry]),
  )

  const native = TARGETS.map((target) => {
    const entry = byName.get(target.packageName)
    if (!entry) {
      fail(
        `The pack report is missing ${target.packageName}. Re-pack with every platform; a release never publishes a partial matrix.`,
      )
    }
    return entry
  })
  const main = byName.get(MAIN_PACKAGE_NAME)
  if (!main) {
    fail(`The pack report is missing the ${MAIN_PACKAGE_NAME} main package.`)
  }

  for (const entry of [...native, main]) {
    if (entry.version !== report.npmVersion) {
      fail(
        `${entry.name} is packed as ${entry.version} but the release is ${report.npmVersion}. Refusing to publish a mixed release.`,
      )
    }
    const tarball = join(artifacts, entry.tarball)
    if (!existsSync(tarball)) {
      fail(`${entry.name} is missing its tarball at ${entry.tarball}.`)
    }
    const actual = sha256File(tarball)
    if (actual !== entry.integrity) {
      fail(
        `${entry.name}: ${entry.tarball} no longer matches the packed integrity (${actual} != ${entry.integrity}). Re-pack the release.`,
      )
    }
  }

  const steps = [
    ...native.map((entry) => ({
      kind: "publish-native",
      name: entry.name,
      version: entry.version,
      tarball: entry.tarball,
      integrity: entry.integrity,
      tag: "next",
    })),
    {
      kind: "publish-main",
      name: main.name,
      version: main.version,
      tarball: main.tarball,
      integrity: main.integrity,
      tag: "next",
    },
    { kind: "smoke", name: main.name, version: main.version },
  ]
  if (tag === "latest") {
    steps.push({
      kind: "promote",
      name: main.name,
      version: main.version,
      tag: "latest",
    })
  }

  return {
    npmVersion: report.npmVersion,
    coreVersion: report.coreVersion,
    coreRevision: report.coreRevision,
    tag,
    artifacts,
    suggestedGitTag: `spxa-v${report.npmVersion}`,
    steps,
  }
}

export function formatPlan(plan) {
  const lines = [
    `spxa ${plan.npmVersion} (core ${plan.coreVersion}) → dist-tag ${plan.tag}`,
    `artifacts: ${plan.artifacts}`,
    `suggested git tag (not created by this tool): ${plan.suggestedGitTag}`,
    "order:",
  ]
  plan.steps.forEach((step, index) => {
    const detail =
      step.kind === "smoke"
        ? `install ${step.name}@next from the registry and run it`
        : step.kind === "promote"
          ? `move the ${step.tag} dist-tag to ${step.version}`
          : `${step.name}@${step.version} --tag ${step.tag} (sha256 ${step.integrity})`
    lines.push(`  ${index + 1}. ${step.kind}: ${detail}`)
  })
  return `${lines.join("\n")}\n`
}

/** The adapter that actually talks to the npm registry. */
export const npmRegistry = {
  whoami() {
    return execFileSync("npm", ["whoami"], { encoding: "utf8" }).trim()
  },
  canPublish(packageName) {
    const permission = execFileSync(
      "npm",
      ["access", "get", "status", packageName],
      { encoding: "utf8" },
    )
    return permission.includes("read-write")
  },
  view(packageName, version) {
    try {
      const output = execFileSync(
        "npm",
        ["view", `${packageName}@${version}`, "dist.integrity", "--json"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      )
      const integrity = JSON.parse(output)
      return { integrity: typeof integrity === "string" ? integrity : null }
    } catch {
      return null
    }
  },
  publish(tarballPath, tag) {
    execFileSync(
      "npm",
      ["publish", tarballPath, "--tag", tag, "--access", "public"],
      {
        stdio: "inherit",
      },
    )
  },
  promote(packageName, version, tag) {
    execFileSync("npm", ["dist-tag", "add", `${packageName}@${version}`, tag], {
      stdio: "inherit",
    })
  },
}

/** The integrity of that version on the registry, expressed as the tarball's sha256. */
function publishedIntegrity(registry, step) {
  const published = registry.view(step.name, step.version)
  return published ? published.integrity : null
}

/**
 * @param {{ artifacts: string, tag?: "next" | "latest", dryRun?: boolean }} options
 * @param {{
 *   registry?: typeof npmRegistry,
 *   smoke?: (plan: object, step: object) => void,
 *   write?: (message: string) => void,
 * }} [adapters]
 */
export function publish(options, adapters = {}) {
  const write = adapters.write ?? ((message) => process.stdout.write(message))
  const plan = createPlan(options.artifacts, options.tag ?? "next")

  if (options.dryRun) {
    write(`dry run — nothing was authenticated, published or installed\n`)
    write(formatPlan(plan))
    return { plan, dryRun: true, completed: [], remaining: plan.steps }
  }

  const registry = adapters.registry ?? npmRegistry
  const smoke =
    adapters.smoke ??
    ((_plan, step) => {
      execFileSync(
        "node",
        [
          join(import.meta.dirname, "smoke.mjs"),
          "--registry-install",
          `${step.name}@next`,
        ],
        { stdio: "inherit" },
      )
    })

  const account = registry.whoami()
  if (!account) {
    fail(
      "npm is not authenticated. Run `npm login` before publishing; the release stops here so nothing is half-published.",
    )
  }
  for (const name of [
    MAIN_PACKAGE_NAME,
    ...TARGETS.map((target) => target.packageName),
  ]) {
    if (!registry.canPublish(name)) {
      fail(
        `${account} cannot publish ${name}. Resolve the registry permission first; this tool never renames a package to work around it.`,
      )
    }
  }

  const completed = []
  const remaining = [...plan.steps]

  const finish = (step) => {
    completed.push(step)
    remaining.shift()
  }

  try {
    for (const step of plan.steps) {
      if (step.kind === "publish-native" || step.kind === "publish-main") {
        if (step.kind === "publish-main") {
          // Before the main package, every platform package has to be
          // queryable with matching content.
          for (const native of plan.steps.filter(
            (candidate) => candidate.kind === "publish-native",
          )) {
            const integrity = publishedIntegrity(registry, native)
            if (integrity === null) {
              fail(
                `${native.name}@${native.version} is not queryable yet. The main package is never published before every platform package is available.`,
              )
            }
            if (integrity !== native.integrity) {
              fail(
                `${native.name}@${native.version} is published with different content (${integrity} != ${native.integrity}). Stopping; nothing is overwritten.`,
              )
            }
          }
        }

        const existing = publishedIntegrity(registry, step)
        if (existing !== null) {
          if (existing !== step.integrity) {
            fail(
              `${step.name}@${step.version} already exists with different content (${existing} != ${step.integrity}). Publish a new version; this tool never overwrites or unpublishes.`,
            )
          }
          write(
            `skip ${step.name}@${step.version} (already published, identical integrity)\n`,
          )
          finish(step)
          continue
        }

        registry.publish(join(plan.artifacts, step.tarball), step.tag)
        finish(step)
        continue
      }

      if (step.kind === "smoke") {
        smoke(plan, step)
        finish(step)
        continue
      }

      if (step.kind === "promote") {
        registry.promote(step.name, step.version, step.tag)
        finish(step)
        continue
      }

      fail(`Unknown publication step "${step.kind}".`)
    }
  } catch (error) {
    const retry = {
      plan,
      completed,
      remaining,
      error: error instanceof Error ? error.message : String(error),
    }
    throw Object.assign(
      new PublishError(
        `${retry.error}\n\nThe previously valid latest tag is untouched. Re-run the same command to retry; published versions with identical integrity are skipped.\nRemaining: ${remaining.map((step) => `${step.kind}:${step.name}`).join(", ")}`,
      ),
      { retry },
    )
  }

  return { plan, dryRun: false, completed, remaining }
}

export function parseArguments(argv) {
  const options = { artifacts: "", tag: "next", dryRun: false }

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
      case "--tag":
        options.tag = value()
        break
      case "--dry-run":
        options.dryRun = true
        break
      default:
        fail(`Unknown argument "${argument}". Run with --help for the usage.`)
    }
  }

  if (!options.artifacts) {
    fail("--artifacts is required. Run with --help for the full usage.")
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
    const result = publish(options)
    if (!result.dryRun) {
      process.stdout.write(
        `Published spxa ${result.plan.npmVersion} through ${result.plan.tag} (${result.completed.length} step(s))\n`,
      )
    }
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`publish.mjs: ${message}\n`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2))
}
