import execa from "execa";
import * as path from "node:path";

async function w(cmd: string | string[] = []) {
  return await execa(
    path.join(__dirname, "../../lib/index.js"),
    typeof cmd === "string" ? cmd.split(" ") : cmd
  );
}

describe("@cloudflare/pages-asset-server", () => {
  it("should run", async () => {
    expect((await w("--help")).stdout).toMatchInlineSnapshot(`
      "index.js [command]

      Commands:
        index.js test  test

      Options:
        --help     Show help                                                 [boolean]
        --version  Show version number                                       [boolean]"
    `);
  });
});
