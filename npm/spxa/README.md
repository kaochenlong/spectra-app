# spxa

`spxa` is the npm distribution of the Spectra command-line interface.

The package contains a small MIT-licensed Node.js launcher. It installs one
matching native Rust executable as an exact-version optional dependency, and
each native package tarball carries its compiled executable directly. Nothing
is downloaded during installation or at run time.

## Install and run

Global installation:

```sh
npm install -g spxa
spxa init
```

Project dependency:

```sh
npm install --save-dev spxa
npm exec spxa -- init
```

One-time run:

```sh
npx spxa init
```

Node.js 22.14 or newer is required. Installation is verified with npm 11.

### Coding agents need `spxa` on their PATH

The Spectra skills that `spxa init` generates call `spxa` directly. `npx` runs
the CLI once and leaves no permanent command behind, so for an agent to run
those skills one of the following has to be true:

- `spxa` is installed globally (`npm install -g spxa`), or
- the project's `node_modules/.bin` is on the PATH of the environment the agent
  runs commands in.

`spxa` never modifies your shell configuration and never rewrites a generated
command into an `npx` call.

## Supported platforms

| Runtime tuple       | Native package                   | Minimum environment |
| ------------------- | -------------------------------- | ------------------- |
| `darwin-arm64`      | `@5xcampus/spxa-darwin-arm64`    | macOS 13            |
| `darwin-x64`        | `@5xcampus/spxa-darwin-x64`      | macOS 13            |
| `linux-arm64-glibc` | `@5xcampus/spxa-linux-arm64-gnu` | glibc 2.31          |
| `linux-x64-glibc`   | `@5xcampus/spxa-linux-x64-gnu`   | glibc 2.31          |
| `win32-x64`         | `@5xcampus/spxa-win32-x64`       | Windows 10 x64      |

Linux musl, Windows arm64, and every other tuple are unsupported in this
release. On an unsupported runtime the launcher exits 1 with
`SPXA_UNSUPPORTED_RUNTIME`, naming the tuple it detected and the tuples it
supports. An undetectable Linux libc is reported as `unknown`, not as musl.

The launcher never searches `PATH` for a different CLI and never downloads a
fallback.

Do not install with `--omit=optional`: the matching native package is required.
When it is missing or its version does not match, the launcher exits 1 with
`SPXA_NATIVE_PACKAGE_MISSING` or `SPXA_NATIVE_VERSION_MISMATCH` and names the
exact package and version to reinstall.

## Two versions: npm and core

`spxa` has its own npm version, independent of the Spectra core version the
native executable reports. A launcher-only release can ship a new npm version
while reusing the same verified core.

```sh
spxa --version      # spxa <npmVersion> (core <coreVersion>)
```

The npm version and the core version both come from validated package
metadata. Running the native executable directly reports only its core
version.

## Updates

npm owns every file it installed, so `spxa` does not replace itself.

```sh
npm install -g spxa@latest              # update a global installation
npm install --save-dev spxa@latest      # update a project dependency
```

`spxa self-update` exits 1 and points at the commands above. It leaves the
native executable untouched and never contacts a release server.

`spxa update` is a different command: it regenerates the Spectra tool files
inside your project. It has nothing to do with updating `spxa` itself.

## Licensing

- The JavaScript launcher in the `spxa` package is MIT licensed.
- The `@5xcampus/spxa-*` packages contain publicly downloadable proprietary
  binaries, governed by the `LICENSE` file included in each package.
- Third-party components inside each native binary remain under the licences
  listed in that package's `THIRD_PARTY_NOTICES`.
- Installing a public binary grants no access to, or rights in, Spectra's
  proprietary Rust source code.

The desktop Spectra application and the direct `specx` distribution are
separate channels with their own installation and update behaviour. Neither is
affected by an npm release.

## Source and issues

The MIT-licensed launcher source lives at
<https://github.com/kaochenlong/spectra-app/tree/main/npm/spxa>. Report bugs
and request features at
<https://github.com/kaochenlong/spectra-app/issues>.

---

# spxa（繁體中文）

`spxa` 是 Spectra 命令列工具的 npm 發佈版本。

套件本身是一個以 MIT 授權的小型 Node.js launcher，並以「精確版本的
optionalDependency」安裝對應平台的原生 Rust 執行檔；每個平台套件的 tarball 直接
包含編譯好的執行檔。安裝與執行過程都不會另外下載任何東西。

## 安裝與執行

全域安裝：

```sh
npm install -g spxa
spxa init
```

專案安裝：

```sh
npm install --save-dev spxa
npm exec spxa -- init
```

單次執行：

```sh
npx spxa init
```

需要 Node.js 22.14 或更新版本，安裝驗收使用 npm 11。

### coding agent 需要在 PATH 上找得到 `spxa`

`spxa init` 產生的 Spectra skills 會直接呼叫 `spxa`。`npx` 只執行一次、不會留下
常駐指令，所以要讓 agent 跑得動那些 skills，下列其中一項必須成立：

- 已經全域安裝（`npm install -g spxa`），或
- agent 執行命令的環境中，專案的 `node_modules/.bin` 在 PATH 上。

`spxa` 不會改你的 shell 設定，也不會把產生出來的指令改寫成 `npx` 呼叫。

## 支援平台

| Runtime tuple       | 平台套件                         | 最低環境       |
| ------------------- | -------------------------------- | -------------- |
| `darwin-arm64`      | `@5xcampus/spxa-darwin-arm64`    | macOS 13       |
| `darwin-x64`        | `@5xcampus/spxa-darwin-x64`      | macOS 13       |
| `linux-arm64-glibc` | `@5xcampus/spxa-linux-arm64-gnu` | glibc 2.31     |
| `linux-x64-glibc`   | `@5xcampus/spxa-linux-x64-gnu`   | glibc 2.31     |
| `win32-x64`         | `@5xcampus/spxa-win32-x64`       | Windows 10 x64 |

這一版不支援 Linux musl、Windows arm64 與其他 tuple。在不支援的環境上，launcher
會以 `SPXA_UNSUPPORTED_RUNTIME` 退出 1，並列出偵測到的 tuple 與支援清單。偵測不出
來的 Linux libc 會回報 `unknown`，不會當成 musl。

launcher 不會去 PATH 找別的 CLI，也不會下載替代品。

請不要用 `--omit=optional` 安裝：對應平台的套件是必要的。缺少或版本不符時，
launcher 會以 `SPXA_NATIVE_PACKAGE_MISSING` 或 `SPXA_NATIVE_VERSION_MISMATCH`
退出 1，並指出需要重裝的確切套件與版本。

## 兩個版本號：npm 與 core

`spxa` 有自己的 npm 版本，與原生執行檔回報的 Spectra core 版本各自獨立。只修
launcher 的發佈可以帶新的 npm 版本、重用同一個已驗證的 core。

```sh
spxa --version      # spxa <npmVersion> (core <coreVersion>)
```

兩個版本號都來自驗證過的套件 metadata。直接執行原生執行檔時，只會回報 core 版本。

## 更新

npm 擁有它安裝的每個檔案，所以 `spxa` 不會替換自己。

```sh
npm install -g spxa@latest              # 更新全域安裝
npm install --save-dev spxa@latest      # 更新專案依賴
```

`spxa self-update` 會退出 1 並指向上面的指令，不會動到原生執行檔，也不會連任何
發佈伺服器。

`spxa update` 是另一件事：它重新產生你專案裡的 Spectra 工具檔，與更新 `spxa`
本身無關。

## 授權

- `spxa` 套件裡的 JavaScript launcher 採 MIT 授權。
- `@5xcampus/spxa-*` 套件內含可公開下載的專有二進位檔，適用各套件內附的
  `LICENSE`。
- 每個原生執行檔中的第三方元件，仍適用該套件 `THIRD_PARTY_NOTICES` 所列的授權。
- 安裝公開的二進位檔，不代表取得 Spectra 專有 Rust 原始碼的存取權或任何權利。

桌面版 Spectra 與既有的 `specx` 直接安裝通路是各自獨立的通道，有自己的安裝與更新
行為；npm 的發佈不會影響它們。

## 原始碼與問題回報

MIT 授權的 launcher 原始碼在
<https://github.com/kaochenlong/spectra-app/tree/main/npm/spxa>。問題回報與功能
需求請到
<https://github.com/kaochenlong/spectra-app/issues>。
