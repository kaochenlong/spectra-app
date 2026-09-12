import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TARGETS } from "../target-registry.mjs"
import {
  HELP,
  MAIN_PACKAGE_NAME,
  PACK_REPORT_FILENAME,
  canPublishPackage,
  createPlan,
  formatPlan,
  matchesPublishedIntegrity,
  parseAccountPermissions,
  parseArguments,
  publish,
} from "./publish.mjs"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex")

/**
 * The integrity npm actually reports: Subresource Integrity, sha512 in base64.
 * The fake registry has to speak this shape, otherwise a comparison against a
 * hex sha256 looks like it matches in tests and fails against the real
 * registry.
 */
const registryIntegrity = (data: string) =>
  `sha512-${createHash("sha512").update(data).digest("base64")}`

/** A staging directory shaped like pack.mjs output, with matching tarballs and checksums. */
function staging(overrides: Record<string, unknown> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "spxa-publish-"))
  roots.push(root)
  const directory = join(root, "staging")
  mkdirSync(join(directory, "tarballs"), { recursive: true })

  const packages = [
    { name: MAIN_PACKAGE_NAME, file: "spxa-0.1.0.tgz" },
    ...TARGETS.map((target) => ({
      name: target.packageName,
      file: `${target.packageName.replace(/[@/]/g, "-").replace(/^-/, "")}-0.1.0.tgz`,
    })),
  ].map(({ name, file }) => {
    const body = `tarball bytes for ${name}\n`
    writeFileSync(join(directory, "tarballs", file), body)
    return {
      name,
      version: "0.1.0",
      tarball: join("tarballs", file),
      sha256: sha256(body),
    }
  })

  writeFileSync(
    join(directory, PACK_REPORT_FILENAME),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        npmVersion: "0.1.0",
        coreVersion: "3.0.0",
        coreRevision: "a".repeat(40),
        launcherRevision: "b".repeat(40),
        dirty: false,
        packages,
        ...overrides,
      },
      null,
      2,
    )}\n`,
  )

  return directory
}

function patchReport(
  directory: string,
  mutate: (report: Record<string, any>) => void,
): void {
  const path = join(directory, PACK_REPORT_FILENAME)
  const report = JSON.parse(readFileSync(path, "utf8"))
  mutate(report)
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
}

/** Fake registry: records every action and lets the test control what is already published. */
function fakeRegistry(published = new Map<string, string>()) {
  const actions: string[] = []
  return {
    actions,
    published,
    whoami: vi.fn(() => "release-bot"),
    canPublish: vi.fn(() => true),
    view: vi.fn((name: string, version: string) => {
      const key = `${name}@${version}`
      actions.push(`view ${key}`)
      return published.has(key)
        ? { integrity: published.get(key) as string }
        : null
    }),
    publish: vi.fn((tarballPath: string, tag: string) => {
      const body = readFileSync(tarballPath, "utf8")
      const name = body.replace("tarball bytes for ", "").trim()
      actions.push(`publish ${name}@0.1.0 --tag ${tag}`)
      published.set(`${name}@0.1.0`, registryIntegrity(body))
    }),
    promote: vi.fn((name: string, version: string, tag: string) => {
      actions.push(`promote ${name}@${version} ${tag}`)
    }),
  }
}

describe("publish --help and arguments", () => {
  it("documents the order and the channels it never touches", () => {
    expect(HELP).toContain("--artifacts")
    expect(HELP).toContain("--tag next|latest")
    expect(HELP).toContain("--dry-run")
    expect(HELP).toContain("never creates a GitHub Release")
    expect(HELP).toContain("spxa-v<version>")
  })

  it("requires artifacts and only accepts the two dist-tags", () => {
    expect(() => parseArguments([])).toThrow(/--artifacts is required/)
    expect(parseArguments(["--artifacts", "/in"]).tag).toBe("next")
    expect(() => createPlan(staging(), "beta" as never)).toThrow(
      /is not supported\. Use one of: next, latest/,
    )
  })
})

describe("publish permission checks", () => {
  it("reads the permission this account holds for each package", () => {
    const permissions = parseAccountPermissions(
      JSON.stringify({
        "@kaochenlong/spxa-darwin-arm64": "read-write",
        "someone-elses-package": "read-only",
      }),
    )

    expect(permissions).toEqual({
      "@kaochenlong/spxa-darwin-arm64": "read-write",
      "someone-elses-package": "read-only",
    })
  })

  // `npm access get status` and `npm access list packages` return the same
  // shape with different meanings: the first is a package's visibility, the
  // second is the permission this account holds. Reading a visibility as a
  // permission silently denies every publish, so it has to fail loudly.
  it("refuses a package visibility map instead of silently denying everything", () => {
    for (const visibility of ["private", "public"]) {
      expect(() =>
        parseAccountPermissions(JSON.stringify({ spxa: visibility })),
      ).toThrow(/visibility.*not a permission|not a permission.*visibility/i)
    }
    expect(() => parseAccountPermissions("not json at all")).toThrow()
  })

  it("refuses a permission value it does not recognise", () => {
    for (const unexpected of ["write-only", "owner", "", "true"]) {
      expect(
        () => parseAccountPermissions(JSON.stringify({ spxa: unexpected })),
        unexpected,
      ).toThrow(/unrecognised permission/)
    }
    expect(() => parseAccountPermissions(JSON.stringify(["spxa"]))).toThrow(
      /package-to-permission object/,
    )
  })

  it("allows a package this account holds read-write on", () => {
    expect(
      canPublishPackage("spxa", {
        permissions: { spxa: "read-write" },
        published: true,
      }),
    ).toBe(true)
    expect(
      canPublishPackage("spxa", {
        permissions: { spxa: "read-only" },
        published: true,
      }),
    ).toBe(false)
  })

  // A first publish is the normal case for this release: the name is listed
  // nowhere because nobody has published it. The registry is the authority at
  // publish time, so an unpublished name must not be pre-denied.
  it("allows an unpublished name and refuses someone else's package", () => {
    expect(
      canPublishPackage("@kaochenlong/spxa-win32-x64", {
        permissions: {},
        published: false,
      }),
    ).toBe(true)
    expect(
      canPublishPackage("express", { permissions: {}, published: true }),
    ).toBe(false)
  })
})

describe("publish integrity comparison", () => {
  function tarball(body: string): string {
    const root = mkdtempSync(join(tmpdir(), "spxa-integrity-"))
    roots.push(root)
    const path = join(root, "package.tgz")
    writeFileSync(path, body)
    return path
  }

  // The registry speaks Subresource Integrity. Comparing a hex sha256 of the
  // same file against `sha512-<base64>` never matches, which turned every
  // retry into a reported content conflict.
  it("compares using the algorithm the registry reported", () => {
    const body = "tarball bytes\n"
    const path = tarball(body)

    expect(matchesPublishedIntegrity(path, registryIntegrity(body))).toBe(true)
    expect(
      matchesPublishedIntegrity(path, registryIntegrity("other bytes\n")),
    ).toBe(false)

    // A hex sha256 is not what the registry reports, and must not be treated
    // as a match for the same bytes.
    expect(matchesPublishedIntegrity(path, `sha256-${sha256(body)}`)).toBe(
      false,
    )
    // ...but the same digest in the registry's own encoding does match.
    expect(
      matchesPublishedIntegrity(
        path,
        `sha256-${createHash("sha256").update(body).digest("base64")}`,
      ),
    ).toBe(true)
  })

  it("accepts any one of several digests the registry may list", () => {
    const body = "tarball bytes\n"
    const path = tarball(body)

    expect(
      matchesPublishedIntegrity(
        path,
        `sha512-${createHash("sha512").update("other").digest("base64")} ${registryIntegrity(body)}`,
      ),
    ).toBe(true)
  })

  it("refuses an integrity it cannot read instead of reporting a conflict", () => {
    const path = tarball("tarball bytes\n")

    for (const unreadable of ["", "deadbeef", null, undefined, 42]) {
      expect(
        () => matchesPublishedIntegrity(path, unreadable as never),
        String(unreadable),
      ).toThrow(/cannot read/)
    }
    // An algorithm this runtime cannot compute is simply not a match.
    expect(matchesPublishedIntegrity(path, "sha3999-abc")).toBe(false)
  })
})

describe("publish plan", () => {
  it("orders platform packages before the main package, smoke and latest", () => {
    const plan = createPlan(staging(), "latest")

    expect(plan.steps.map((step) => step.kind)).toEqual([
      ...TARGETS.map(() => "publish-native"),
      "publish-main",
      "smoke",
      "promote",
    ])
    expect(plan.suggestedGitTag).toBe("spxa-v0.1.0")
    expect(plan.steps.at(-1)).toMatchObject({
      kind: "promote",
      name: MAIN_PACKAGE_NAME,
      tag: "latest",
    })
    // --tag next still goes through next and the smoke check; it just does not promote latest
    expect(
      createPlan(staging(), "next").steps.map((step) => step.kind),
    ).toEqual([...TARGETS.map(() => "publish-native"), "publish-main", "smoke"])
  })

  it("refuses an incomplete matrix, a mixed version, a dirty pack and a tampered tarball", () => {
    const missing = staging()
    patchReport(missing, (report) => {
      report.packages = report.packages.filter(
        (entry: { name: string }) =>
          entry.name !== "@kaochenlong/spxa-win32-x64",
      )
    })
    expect(() => createPlan(missing, "next")).toThrow(
      /missing @kaochenlong\/spxa-win32-x64/,
    )

    const mixed = staging()
    patchReport(mixed, (report) => {
      report.packages[1].version = "0.1.1"
    })
    expect(() => createPlan(mixed, "next")).toThrow(/mixed release/)

    const dirty = staging({ dirty: true })
    expect(() => createPlan(dirty, "next")).toThrow(/marked dirty/)

    const tampered = staging()
    const report = JSON.parse(
      readFileSync(join(tampered, PACK_REPORT_FILENAME), "utf8"),
    )
    writeFileSync(
      join(tampered, report.packages[0].tarball),
      "different bytes\n",
    )
    expect(() => createPlan(tampered, "next")).toThrow(
      /no longer matches the packed sha256/,
    )
  })
})

describe("publish --dry-run", () => {
  // Scenario: Dry run has no external side effect
  it("prints the plan without authenticating, publishing, tagging or installing", () => {
    const directory = staging()
    const lines: string[] = []
    const forbidden = () => {
      throw new Error("a dry run must not touch the registry")
    }
    const registry = {
      whoami: vi.fn(forbidden),
      canPublish: vi.fn(forbidden),
      view: vi.fn(forbidden),
      publish: vi.fn(forbidden),
      promote: vi.fn(forbidden),
    }
    const smoke = vi.fn(forbidden)
    const fetchSpy = vi.fn(forbidden)
    const realFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as never

    try {
      const result = publish(
        { artifacts: directory, tag: "latest", dryRun: true },
        {
          registry: registry as never,
          smoke,
          write: (line) => lines.push(line),
        },
      )

      expect(result.dryRun).toBe(true)
      expect(result.completed).toEqual([])
      expect(result.remaining).toHaveLength(TARGETS.length + 3)
    } finally {
      globalThis.fetch = realFetch
    }

    for (const spy of Object.values(registry)) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(smoke).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()

    const printed = lines.join("")
    expect(printed).toContain("dry run")
    expect(printed).toContain("spxa 0.1.0 (core 3.0.0)")
    expect(printed).toContain("dist-tag latest")
    expect(printed).toContain("spxa-v0.1.0")
    for (const target of TARGETS) {
      expect(printed).toContain(target.packageName)
    }
    // The staging directory itself is untouched
    expect(readdirSync(directory).sort()).toEqual([
      PACK_REPORT_FILENAME,
      "tarballs",
    ])
  })

  it("still verifies the local artifacts before printing anything", () => {
    const directory = staging()
    patchReport(directory, (report) => {
      report.packages = report.packages.slice(0, 2)
    })
    const write = vi.fn()

    expect(() =>
      publish({ artifacts: directory, dryRun: true }, { write }),
    ).toThrow(/missing/)
    expect(write).not.toHaveBeenCalled()
  })
})

describe("publish ordering", () => {
  // Scenario: Platform publication precedes main publication
  it("publishes every platform package, then the main package, then smokes, then promotes", () => {
    const registry = fakeRegistry()
    const smoke = vi.fn()

    const result = publish(
      { artifacts: staging(), tag: "latest" },
      { registry: registry as never, smoke, write: () => {} },
    )

    const publishes = registry.actions.filter((action) =>
      action.startsWith("publish "),
    )
    const mainIndex = publishes.findIndex((action) =>
      action.startsWith("publish spxa@"),
    )
    expect(mainIndex).toBe(publishes.length - 1)
    expect(publishes).toHaveLength(TARGETS.length + 1)

    const promoteIndex = registry.actions.findIndex((action) =>
      action.startsWith("promote "),
    )
    expect(promoteIndex).toBe(registry.actions.length - 1)
    expect(smoke).toHaveBeenCalledTimes(1)
    // The smoke check has to come before the promotion
    expect(registry.promote).toHaveBeenCalledWith(
      MAIN_PACKAGE_NAME,
      "0.1.0",
      "latest",
    )
    expect(result.remaining).toEqual([])
  })

  it("never promotes latest when the smoke check fails", () => {
    const registry = fakeRegistry()
    const smoke = vi.fn(() => {
      throw new Error("installed CLI did not run")
    })

    expect(() =>
      publish(
        { artifacts: staging(), tag: "latest" },
        { registry: registry as never, smoke, write: () => {} },
      ),
    ).toThrow(/installed CLI did not run/)

    expect(registry.promote).not.toHaveBeenCalled()
    expect(
      registry.actions.some((action) => action.startsWith("promote")),
    ).toBe(false)
  })

  it("stops before the main package when a platform package is not queryable", () => {
    const registry = fakeRegistry()
    // The platform package "publishes" but is not queryable on the registry
    registry.publish = vi.fn((tarballPath: string, tag: string) => {
      registry.actions.push(`publish (not indexed) --tag ${tag}`)
    }) as never

    expect(() =>
      publish(
        { artifacts: staging(), tag: "next" },
        { registry: registry as never, smoke: vi.fn(), write: () => {} },
      ),
    ).toThrow(/is not queryable yet/)

    expect(
      registry.actions.some((action) => action.includes("spxa@0.1.0")),
    ).toBe(false)
  })

  // Scenario: Platform publication precedes main publication — the platform
  // packages must be queryable *with matching integrity*, not merely present.
  it("stops before the main package when a platform package holds other content", () => {
    const directory = staging()
    const registry = fakeRegistry()
    // Every platform publish lands, but one of them reports foreign content
    // when queried back.
    const realPublish = registry.publish
    registry.publish = vi.fn((tarballPath: string, tag: string) => {
      realPublish(tarballPath, tag)
      const body = readFileSync(tarballPath, "utf8")
      if (body.includes("linux-arm64-gnu")) {
        const name = body.replace("tarball bytes for ", "").trim()
        registry.published.set(
          `${name}@0.1.0`,
          registryIntegrity("foreign bytes\n"),
        )
      }
    }) as never

    expect(() =>
      publish(
        { artifacts: directory, tag: "latest" },
        { registry: registry as never, smoke: vi.fn(), write: () => {} },
      ),
    ).toThrow(/is published with different content than/)

    expect(
      registry.actions.some((action) => action.includes("publish spxa@")),
    ).toBe(false)
    expect(registry.promote).not.toHaveBeenCalled()
  })

  it("refuses to publish when the account cannot publish every package", () => {
    const registry = fakeRegistry()
    registry.canPublish = vi.fn(
      (name: string) => name !== "@kaochenlong/spxa-linux-x64-gnu",
    ) as never

    expect(() =>
      publish(
        { artifacts: staging(), tag: "next" },
        { registry: registry as never, smoke: vi.fn(), write: () => {} },
      ),
    ).toThrow(/cannot publish @kaochenlong\/spxa-linux-x64-gnu/)
    expect(registry.publish).not.toHaveBeenCalled()
  })

  it("refuses to publish without an authenticated account", () => {
    const registry = fakeRegistry()
    registry.whoami = vi.fn(() => "") as never

    expect(() =>
      publish(
        { artifacts: staging(), tag: "next" },
        { registry: registry as never, smoke: vi.fn(), write: () => {} },
      ),
    ).toThrow(/npm is not authenticated/)
    expect(registry.publish).not.toHaveBeenCalled()
  })
})

describe("publish retry", () => {
  // Scenario: Partial publication can be retried
  it("skips published versions with identical integrity and completes the rest", () => {
    const directory = staging()
    const published = new Map<string, string>()
    const firstRegistry = fakeRegistry(published)
    const failingSmoke = vi.fn(() => {
      throw new Error("registry smoke check failed")
    })

    let retry: { remaining: { kind: string }[] } | undefined
    try {
      publish(
        { artifacts: directory, tag: "latest" },
        {
          registry: firstRegistry as never,
          smoke: failingSmoke,
          write: () => {},
        },
      )
    } catch (error) {
      retry = (error as { retry?: typeof retry }).retry
    }
    expect(retry?.remaining.map((step) => step.kind)).toEqual([
      "smoke",
      "promote",
    ])
    expect(published.size).toBe(TARGETS.length + 1)

    // Retry: versions already published with identical integrity are skipped, not republished
    const secondRegistry = fakeRegistry(published)
    const lines: string[] = []
    const result = publish(
      { artifacts: directory, tag: "latest" },
      {
        registry: secondRegistry as never,
        smoke: vi.fn(),
        write: (line) => lines.push(line),
      },
    )

    expect(secondRegistry.publish).not.toHaveBeenCalled()
    expect(lines.join("")).toContain("already published, identical integrity")
    expect(secondRegistry.promote).toHaveBeenCalledWith(
      MAIN_PACKAGE_NAME,
      "0.1.0",
      "latest",
    )
    expect(result.remaining).toEqual([])
  })

  it("stops on conflicting content and never overwrites or unpublishes", () => {
    const directory = staging()
    const published = new Map<string, string>([
      [
        "@kaochenlong/spxa-darwin-arm64@0.1.0",
        registryIntegrity("someone else's bytes\n"),
      ],
    ])
    const registry = fakeRegistry(published)

    expect(() =>
      publish(
        { artifacts: directory, tag: "latest" },
        { registry: registry as never, smoke: vi.fn(), write: () => {} },
      ),
    ).toThrow(/already exists with different content/)

    expect(registry.publish).not.toHaveBeenCalled()
    expect(registry.promote).not.toHaveBeenCalled()
    expect(published.get("@kaochenlong/spxa-darwin-arm64@0.1.0")).toBe(
      registryIntegrity("someone else's bytes\n"),
    )
  })

  it("reports a retryable plan that leaves the previous latest tag alone", () => {
    const registry = fakeRegistry()
    registry.publish = vi.fn((tarballPath: string) => {
      const body = readFileSync(tarballPath, "utf8")
      if (body.includes("linux-x64-gnu")) {
        throw new Error("network reset while uploading")
      }
      const name = body.replace("tarball bytes for ", "").trim()
      registry.published.set(`${name}@0.1.0`, registryIntegrity(body))
    }) as never

    let message = ""
    try {
      publish(
        { artifacts: staging(), tag: "latest" },
        { registry: registry as never, smoke: vi.fn(), write: () => {} },
      )
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain("network reset while uploading")
    expect(message).toContain("previously valid latest tag is untouched")
    expect(message).toContain("Remaining:")
    expect(registry.promote).not.toHaveBeenCalled()
  })
})

describe("publish channel isolation", () => {
  // Scenario: Desktop and legacy update channels are preserved
  it("only ever runs npm and node, and only these npm subcommands", () => {
    const source = readFileSync(
      join(import.meta.dirname, "publish.mjs"),
      "utf8",
    )

    const commands = [...source.matchAll(/execFileSync\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    )
    expect(commands.length).toBeGreaterThan(0)
    expect(new Set(commands)).toEqual(new Set(["npm", "node"]))

    const npmSubcommands = [
      ...source.matchAll(/execFileSync\(\s*"npm",\s*\[\s*"([^"]+)"/g),
    ].map((match) => match[1])
    // No unpublish, no --force, no deprecate
    expect(new Set(npmSubcommands)).toEqual(
      new Set(["whoami", "access", "view", "publish", "dist-tag"]),
    )

    // These strings must never appear: there is no entry point into the desktop or legacy channels
    for (const forbidden of [
      "latest.json",
      "api.github.com",
      "r2.cloudflarestorage",
      "make_latest",
      "releases/tags",
    ]) {
      expect(source, forbidden).not.toContain(forbidden)
    }
  })

  it("formats a plan that names the git tag without creating it", () => {
    const plan = createPlan(staging(), "latest")
    expect(formatPlan(plan)).toContain(
      "suggested git tag (not created by this tool): spxa-v0.1.0",
    )
  })
})
