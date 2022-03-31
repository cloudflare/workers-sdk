import { execaSync } from "execa";
import { getPackageManager } from "../package-manager";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { PackageManager } from "../package-manager";

describe("subcommand implicit help ran on imcomplete command execution", () => {
  let mockPackageManager: PackageManager;
  runInTempDir();

  beforeEach(() => {
    mockPackageManager = {
      cwd: process.cwd(),
      // @ts-expect-error we're making a fake package manager here
      type: "mockpm",
      addDevDeps: jest.fn(),
      install: jest.fn(),
    };
    (getPackageManager as jest.Mock).mockResolvedValue(mockPackageManager);
  });

  const std = mockConsoleMethods();
  function endEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
  }

  it("should should display a list of available subcommands, for pages with no subcommand", async () => {
    await runWrangler("pages");
    await endEventLoop();

    expect(std.out).toMatchInlineSnapshot(`
      "wrangler pages

      ⚡️ Configure Cloudflare Pages

      Commands:
        wrangler pages dev [directory] [-- command]  🧑‍💻 Develop your full-stack Pages application locally

      Flags:
        -c, --config      Path to .toml configuration file  [string]
        -h, --help        Show help  [boolean]
        -v, --version     Show version number  [boolean]
            --legacy-env  Use legacy environments  [boolean]

      🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"
    `);
  });
});

describe("beta message for subcommands", () => {
  const betaMsg =
    "🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose";
  const isWindows = process.platform === "win32";
  it("should display for pages:dev", async () => {
    let err: Error | undefined;
    try {
      execaSync("npx", ["wrangler", "pages", "dev"], {
        shell: isWindows,
        env: { BROWSER: "none", ...process.env },
      }).stderr;
    } catch (e: unknown) {
      err = e as Error;
    }
    expect(err?.message.includes(betaMsg)).toBe(true);
  });

  it("should display for pages:functions", async () => {
    let err: Error | undefined;
    try {
      execaSync("npx", ["wrangler", "pages", "functions", "build"], {
        shell: isWindows,
        env: { BROWSER: "none", ...process.env },
      });
    } catch (e: unknown) {
      err = e as Error;
    }

    expect(err?.message.includes(betaMsg)).toBe(true);
  });
});
