import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("subcommand implicit help ran on incomplete command execution", () => {
  runInTempDir();
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

  describe("beta message for subcommands", () => {
    it("should display for pages:dev", async () => {
      await expect(
        runWrangler("pages dev")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Must specify a directory of static assets to serve or a command to run."`
      );

      expect(std.out).toMatchInlineSnapshot(
        `"🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"`
      );
    });

    // Note that `wrangler pages functions` does nothing...

    it("should display for pages:functions:build", async () => {
      await expect(runWrangler("pages functions build")).rejects.toThrowError();

      expect(std.out).toMatchInlineSnapshot(
        `"🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"`
      );
    });
  });
});
