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
  it("no subcommand for 'pages' should display a list of available subcommands", async () => {
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
          --legacy-env  Use legacy environments  [boolean]"
    `);
  });
});
