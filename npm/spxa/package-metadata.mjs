import { readFileSync } from "node:fs"

/**
 * The main package's own package.json — the single source of truth for npm
 * metadata.
 *
 * npm always includes package.json in the tarball, so this is readable from an
 * installed copy too.
 */
export const SPXA_PACKAGE = Object.freeze(
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")),
)

/**
 * This npm package's own version (npmVersion).
 *
 * It is independent of the coreVersion the native executable reports: a
 * launcher-only release carries a new npmVersion while reusing the same
 * verified core.
 */
export const SPXA_NPM_VERSION = SPXA_PACKAGE.version

/**
 * The published name of this package.
 *
 * Read from package.json so the packaging and smoke tools cannot drift from
 * what npm actually publishes. Note this is not the executable name: `bin`
 * installs the `spxa` command regardless of the package name.
 */
export const SPXA_PACKAGE_NAME = SPXA_PACKAGE.name

/** Minimum supported Node version. */
export const SPXA_MIN_NODE_VERSION = SPXA_PACKAGE.engines.node

export const SPXA_PUBLIC_REPOSITORY = Object.freeze(SPXA_PACKAGE.repository)

export const SPXA_PUBLIC_HOMEPAGE = SPXA_PACKAGE.homepage

export const SPXA_PUBLIC_BUGS = Object.freeze(SPXA_PACKAGE.bugs)
