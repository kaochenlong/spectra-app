import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  SPXA_MIN_NODE_VERSION,
  SPXA_NPM_VERSION,
  SPXA_PACKAGE,
  SPXA_PUBLIC_BUGS,
  SPXA_PUBLIC_HOMEPAGE,
  SPXA_PUBLIC_REPOSITORY,
} from "./package-metadata.mjs"
import { TARGETS, createOptionalDependencies } from "./target-registry.mjs"

const PUBLIC_REPOSITORY_URL = "https://github.com/kaochenlong/spectra-app"

describe("spxa public package metadata", () => {
  // Scenario: Public repository metadata is correct
  it("points at the public repository and the launcher directory", () => {
    expect(SPXA_PUBLIC_REPOSITORY).toEqual({
      type: "git",
      url: `git+${PUBLIC_REPOSITORY_URL}.git`,
      directory: "npm/spxa",
    })
    expect(SPXA_PUBLIC_BUGS.url).toBe(`${PUBLIC_REPOSITORY_URL}/issues`)
    expect(SPXA_PUBLIC_HOMEPAGE.startsWith(PUBLIC_REPOSITORY_URL)).toBe(true)
  })

  // Scenario: Global local and one-time installation — the package must not
  // create or replace a spectra executable.
  it("exposes spxa and nothing else", () => {
    expect(Object.keys(SPXA_PACKAGE.bin)).toEqual(["spxa"])
    expect(SPXA_PACKAGE.bin.spxa).toBe("bin/spxa.mjs")
    expect(JSON.stringify(SPXA_PACKAGE.bin)).not.toContain("spectra")
  })

  it("declares the supported Node minimum", () => {
    expect(SPXA_MIN_NODE_VERSION).toBe(">=22.14.0")
    expect(SPXA_PACKAGE.engines.node).toBe(SPXA_MIN_NODE_VERSION)
  })

  it("ships only the files the launcher needs at runtime", () => {
    expect(SPXA_PACKAGE.files).toEqual([
      "bin/spxa.mjs",
      "launcher.mjs",
      "target-registry.mjs",
      "package-metadata.mjs",
      "README.md",
      "LICENSE",
    ])
    for (const entry of SPXA_PACKAGE.files) {
      expect(entry).not.toMatch(/\.test\.ts$/)
      expect(entry).not.toMatch(/node_modules/)
    }
  })

  // Scenario: Missing or mismatched native package — the main and native
  // packages must use the same exact version.
  it("pins every platform package to the main package version", () => {
    const declared = SPXA_PACKAGE.optionalDependencies
    expect(Object.keys(declared).sort()).toEqual(
      TARGETS.map((target) => target.packageName).sort(),
    )
    for (const [name, range] of Object.entries(declared)) {
      expect(range, name).toBe(SPXA_NPM_VERSION)
      expect(range, name).not.toMatch(/[\^~*x]|latest|\s|-\s/)
    }
    expect(declared).toEqual(createOptionalDependencies(SPXA_NPM_VERSION))
  })

  // Scenario: Wrapper-only version can reuse the core — npmVersion is an
  // independent publish input, never derived from the core version.
  it("keeps the npm version independent of the core version", () => {
    const coreVersion = "3.0.0"
    const firstWrapper = createOptionalDependencies("0.1.0")
    const secondWrapper = createOptionalDependencies("0.1.1")

    expect(new Set(Object.values(firstWrapper))).toEqual(new Set(["0.1.0"]))
    expect(new Set(Object.values(secondWrapper))).toEqual(new Set(["0.1.1"]))
    expect(Object.keys(firstWrapper)).toEqual(Object.keys(secondWrapper))
    expect(JSON.stringify(SPXA_PACKAGE)).not.toContain(coreVersion)
  })

  // Public packaging must never reach into the private Rust checkout.
  // The markers are assembled from fragments so this file does not match itself.
  it("never reads the private Rust sources", () => {
    const privateMarkers = ["src" + "-tauri", "Cargo" + ".toml"]
    const escapesTheRepository = /\.\.\/\.\.\/(?!\.)/

    const own = readdirSync(import.meta.dirname).filter(
      (name) => name.endsWith(".mjs") || name.endsWith(".test.ts"),
    )
    expect(own.length).toBeGreaterThan(3)
    for (const name of own) {
      const content = readFileSync(resolve(import.meta.dirname, name), "utf8")
      for (const marker of privateMarkers) {
        expect(content, `${name} must not reference ${marker}`).not.toContain(
          marker,
        )
      }
      expect(content, name).not.toMatch(escapesTheRepository)
    }
  })
})
