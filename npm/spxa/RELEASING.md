# Releasing spxa

Maintainer runbook. This file is not part of the published package.

A release moves through five stages, in this order: export, pack, dry run,
publish to `next`, promote to `latest`. Every stage refuses to continue on
incomplete or mismatched input, so a stage that stops is telling you something.

## 0. Prerequisites

- Node.js 22.14 or newer and npm 11.
- Both checkouts committed. A release export refuses uncommitted sources.
- npm authentication with publish rights for `spxa` and the `@kaochenlong` scope.
- A container image for the Linux targets, pinned by digest. `rust:1.92-bullseye`
  is the current choice: bullseye is glibc 2.31, the declared Linux minimum.

## 1. Export the delivery (private repository)

First regenerate the third-party notices, so they list exactly what the native
executables contain. Run this in the private repository:

```sh
pnpm tsx scripts/generate-spxa-notices.ts --launcher-root ../spectra-app/npm/spxa
```

- It rewrites `native/THIRD_PARTY_NOTICES` in this directory from what
  `cargo tree -p spxa` reports on every target, and records the SHA-256 of the
  private repository's `src-tauri/Cargo.lock`. The same Cargo.lock always
  produces the same bytes, so an empty `git diff` means the notices were current.
- A package without a license file stops the run and nothing is written.
- Review the diff and commit this repository before exporting. The export stops
  when the hash the notices record differs from the Cargo.lock it builds from
  (with `--reuse-artifacts`, the Cargo.lock at the reused core revision), in
  release and `--development` mode alike.

The native executables and their manifest also come from the private Spectra
repository. Run this there:

```sh
make build spxa VERSION=0.1.1
```

- `VERSION` is the npmVersion for this release. It is an explicit input; it is
  never derived from a Rust file. Omitting it stops the run.
- The delivery is written to `dist/spxa-<version>` in the private repository.
- The Linux builder images come from `scripts/spxa-builders.json` there, so no
  digest is typed on the command line. A floating tag such as `rust:latest` is
  refused: a glibc compatibility claim needs a pinned builder. Change the pin in
  that file.
- The target builds the full five-target matrix. For a subset, run the
  underlying `scripts/build-spxa.ts` directly with repeated `--target` values.
- `--development` produces an explicitly dirty local package for verification
  only. It can never be published; pass it to the script directly.

For a launcher-only release, reuse the verified native bytes instead of
rebuilding:

```sh
pnpm tsx scripts/build-spxa.ts \
  --launcher-root ../spectra-app/npm/spxa \
  --output dist/spxa-0.1.2 \
  --version 0.1.2 \
  --reuse-artifacts dist/spxa-0.1.1
```

The previous delivery's manifest, every checksum, and its core identity are
verified before anything is reused. `--reuse-artifacts` cannot be combined with
`--target`.

## 2. Pack the tarballs

```sh
node scripts/pack.mjs --artifacts ../../../spectra/dist/spxa-0.1.1 --output dist/pack --version 0.1.1
```

This verifies the matrix, the version, every checksum, the compatibility data
and the source identity before it packs anything. Each tarball is then unpacked
and checked against an explicit allowlist; proprietary sources, Git metadata,
specification artifacts, symlinks and paths that escape the package are
rejected.

The result is `dist/pack/pack-report.json` plus `dist/pack/tarballs/`.

## 3. Dry run

```sh
node scripts/publish.mjs --artifacts dist/pack --tag latest --dry-run
```

A dry run inspects local files and prints the plan: versions, hashes, dist-tag
and order. It does not authenticate, publish, move a dist-tag, or install
anything.

## 4. Verify a local install

```sh
npm run test:distribution -- --artifacts dist/pack
```

This installs the real tarballs into an isolated prefix, project and npm cache,
then runs the CLI: `--help`, `--version`, `init`, `update`, `decisions --json`,
`list --json`, `scope --json` and `self-update`. A fake `spectra` sits first on
PATH for the whole run; the run fails if it is ever executed.

Repeat on the minimum environment of every platform you are declaring support
for. Building a target is not evidence that it runs.

For the Linux targets, the minimum environment is glibc 2.31, which is Debian
bullseye. The host's own distribution is usually newer, so run the check inside
a container that matches the declared minimum:

```sh
docker run --rm --platform linux/arm64 \
  -v "$PWD/dist/pack:/staging:ro" -v "$PWD:/spxa:ro" \
  node:22.14-bullseye \
  bash -c 'npm install -g npm@11 >/dev/null && node /spxa/scripts/smoke.mjs --artifacts /staging'
```

Swap `--platform linux/amd64` for the x64 target. `node:22.14-bullseye` pins
glibc 2.31 together with the minimum supported Node; `npm install -g npm@11`
brings npm up to the version the install is verified with.

## 5. Publish to `next`

```sh
node scripts/publish.mjs --artifacts dist/pack --tag next
```

Order: every platform package first, then `@kaochenlong/spxa@next`, then a registry install
smoke check. A version already published with identical integrity is skipped, so
re-running the same command after a failure is safe. Conflicting content stops
the run; nothing is overwritten and nothing is unpublished.

## 6. Promote to `latest`

```sh
node scripts/publish.mjs --artifacts dist/pack --tag latest
```

`--tag latest` still goes through `next` and the smoke check before the
dist-tag moves.

Tag the release for traceability if you want it — the tool prints the suggested
name and never creates it:

```sh
git tag spxa-v0.1.1 && git push origin spxa-v0.1.1
```

This tool never creates a GitHub Release and never touches the desktop R2
manifest.

## Rolling back

Published versions stay published. To roll back, move `latest` to a previously
verified version:

```sh
npm dist-tag add @kaochenlong/spxa@0.1.1 latest
```

Then publish a fixed version as `next`, verify it, and promote it. Do not
unpublish and do not republish a version with different content.

---

# 發佈 spxa（繁體中文）

維護者 runbook。這個檔案不會被打包進發佈的套件。

一次發佈依序經過五個階段：匯出、打包、dry run、發到 `next`、提升 `latest`。每個
階段遇到不完整或不一致的輸入都會停下來，所以某個階段停住就是它在告訴你事情。

## 0. 前置條件

- Node.js 22.14 或更新版本，以及 npm 11。
- 兩個 checkout 都已提交。正式匯出會拒絕未提交的原始碼。
- npm 已登入，且對 `spxa` 與 `@kaochenlong` scope 有發布權限。
- Linux target 用的容器 image，必須以 digest 釘住。目前選 `rust:1.92-bullseye`：
  bullseye 就是 glibc 2.31，也就是宣告的 Linux 最低環境。

## 1. 匯出交付包（私有 repo）

先重新產生第三方授權清單，讓它列的剛好是原生執行檔裡的東西。在私有 repo 執行：

```sh
pnpm tsx scripts/generate-spxa-notices.ts --launcher-root ../spectra-app/npm/spxa
```

- 它依 `cargo tree -p spxa` 在每個 target 上回報的套件，改寫這個目錄的
  `native/THIRD_PARTY_NOTICES`，並記錄私有 repo `src-tauri/Cargo.lock` 的 SHA-256。
  同一份 Cargo.lock 產生的內容每次都一樣，所以 `git diff` 沒有變化就代表清單本來就是最新的。
- 有套件找不到授權檔時會停下來，什麼都不寫。
- 看過 diff 後，先 commit 這個 repo 再匯出。清單記錄的雜湊跟這次建置用的 Cargo.lock
  不同時（用 `--reuse-artifacts` 時，比的是被重用 core revision 當時的 Cargo.lock），
  匯出會停下來，正式模式與 `--development` 都一樣。

原生執行檔與它的 manifest 也來自私有的 Spectra repo。在那邊執行：

```sh
make build spxa VERSION=0.1.1
```

- `VERSION` 就是這次的 npmVersion，是明確的輸入，不從任何 Rust 檔案推導；沒給就會停下來。
- 交付包會寫到私有 repo 的 `dist/spxa-<version>`。
- Linux builder image 來自那邊的 `scripts/spxa-builders.json`，所以不需要在命令列打任何
  digest。`rust:latest` 這種浮動 tag 會被拒絕：glibc 相容性宣稱需要釘住的 builder；要換
  pin 就改那個檔案。
- 這個 target 會建完整的五平台矩陣。只要其中幾個的話，直接執行底層的
  `scripts/build-spxa.ts` 並重複給 `--target`。
- `--development` 產生明確標記為 dirty 的本機驗證包，永遠不能被發布；這個參數直接給腳本。

只改 launcher 的發佈，重用已驗證的原生位元、不要重新建置：

```sh
pnpm tsx scripts/build-spxa.ts \
  --launcher-root ../spectra-app/npm/spxa \
  --output dist/spxa-0.1.2 \
  --version 0.1.2 \
  --reuse-artifacts dist/spxa-0.1.1
```

重用之前會先驗證前一份交付包的 manifest、每一個 checksum 與 core identity。
`--reuse-artifacts` 不能與 `--target` 併用。

## 2. 打包 tarball

```sh
node scripts/pack.mjs --artifacts ../../../spectra/dist/spxa-0.1.1 --output dist/pack --version 0.1.1
```

打包之前會先驗證矩陣、版本、每個 checksum、相容性資料與 source identity。每個
tarball 打完會被實際解開、對照明確的 allowlist：專有原始碼、Git metadata、規格
文件、symlink 與越界路徑都會被拒絕。

產出是 `dist/pack/pack-report.json` 與 `dist/pack/tarballs/`。

## 3. Dry run

```sh
node scripts/publish.mjs --artifacts dist/pack --tag latest --dry-run
```

dry run 只檢查本機檔案並印出計畫：版本、hash、dist-tag 與順序。它不登入、不發布、
不移動 dist-tag，也不安裝任何東西。

## 4. 驗證本機安裝

```sh
npm run test:distribution -- --artifacts dist/pack
```

這會把真正的 tarball 安裝到隔離的 prefix、專案與 npm cache，然後實際執行 CLI：
`--help`、`--version`、`init`、`update`、`decisions --json`、`list --json`、
`scope --json` 與 `self-update`。整個過程 PATH 最前面都放著一個假的 `spectra`，
一旦它被執行，這次驗收就失敗。

你宣稱支援的每個平台，都要在它的最低環境上重跑一次。**建置成功不等於執行成功。**

Linux 的最低環境是 glibc 2.31，也就是 Debian bullseye。host 自己的發行版通常比它
新，所以要在符合最低環境的容器裡跑：

```sh
docker run --rm --platform linux/arm64 \
  -v "$PWD/dist/pack:/staging:ro" -v "$PWD:/spxa:ro" \
  node:22.14-bullseye \
  bash -c 'npm install -g npm@11 >/dev/null && node /spxa/scripts/smoke.mjs --artifacts /staging'
```

x64 target 把 `--platform` 換成 `linux/amd64`。`node:22.14-bullseye` 同時釘住
glibc 2.31 與支援的最低 Node；`npm install -g npm@11` 把 npm 補到驗收用的版本。

## 5. 發到 `next`

```sh
node scripts/publish.mjs --artifacts dist/pack --tag next
```

順序是：先全部平台套件，再 `@kaochenlong/spxa@next`，最後 registry 安裝 smoke。已經發布且
integrity 相同的版本會被略過，所以失敗後重跑同一條命令是安全的。內容衝突會讓它
停下來；不覆蓋、不 unpublish。

## 6. 提升 `latest`

```sh
node scripts/publish.mjs --artifacts dist/pack --tag latest
```

`--tag latest` 仍然會先經過 `next` 與 smoke，才移動 dist-tag。

要做追溯就自己打 tag —— 工具只印出建議名稱，不會替你建立：

```sh
git tag spxa-v0.1.1 && git push origin spxa-v0.1.1
```

這個工具不會建立 GitHub Release，也不會動桌面版的 R2 manifest。

## 回退

已發布的版本就留著。要回退的話，把 `latest` 指回先前已驗證的版本：

```sh
npm dist-tag add @kaochenlong/spxa@0.1.1 latest
```

然後把修好的版本發到 `next`、驗證、再提升。不要 unpublish，也不要用不同內容重發
同一個版本。
