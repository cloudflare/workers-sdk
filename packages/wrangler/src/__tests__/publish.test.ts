import * as fs from "node:fs";
import { setMockResponse } from "./mock-cfetch";
import { runInTempDir } from "./run-in-tmp";
import { runWrangler } from "./run-wrangler";

describe("publish", () => {
  runInTempDir();

  it("should be able to use `index` with no extension as the entry-point", async () => {
    writeWranglerToml();
    writeEsmWorkerSource();
    mockUploadWorkerRequest();
    mockSubDomainRequest();

    const { stdout, stderr, error } = await runWrangler("publish ./index");

    expect(stdout).toMatchInlineSnapshot(`
      "Uploaded
      test-name
      (0.00 sec)
      Deployed
      test-name
      (0.00 sec)
       
      test-name.test-sub-domain.workers.dev"
    `);
    expect(stderr).toMatchInlineSnapshot(`""`);
    expect(error).toMatchInlineSnapshot(`undefined`);
  });

  it("should be able to use the `build.upload.main` config as the entry-point for ESM sources", async () => {
    writeWranglerToml("./index.js");
    writeEsmWorkerSource();
    mockUploadWorkerRequest();
    mockSubDomainRequest();

    const { stdout, stderr, error } = await runWrangler("publish");

    expect(stdout).toMatchInlineSnapshot(`
      "Uploaded
      test-name
      (0.00 sec)
      Deployed
      test-name
      (0.00 sec)
       
      test-name.test-sub-domain.workers.dev"
    `);
    expect(stderr).toMatchInlineSnapshot(`""`);
    expect(error).toMatchInlineSnapshot(`undefined`);
  });
});

/** Write a mock wrangler.toml file to disk. */
function writeWranglerToml(main?: string) {
  fs.writeFileSync(
    "./wrangler.toml",
    [
      `compatibility_date = "2022-01-12"`,
      `name = "test-name"`,
      main !== undefined ? `[build.upload]\nmain = "${main}"` : "",
    ].join("\n"),
    "utf-8"
  );
}

/** Write a mock Worker script to disk. */
function writeEsmWorkerSource() {
  fs.writeFileSync(
    "index.js",
    [
      `import { foo } from "./another";`,
      `export default {`,
      `  async fetch(request) {`,
      `    return new Response('Hello' + foo);`,
      `  },`,
      `};`,
    ].join("\n")
  );
  fs.writeFileSync("another.js", `export const foo = 100;`);
}

/** Create a mock handler for the request to upload a worker script. */
function mockUploadWorkerRequest(available_on_subdomain = true) {
  setMockResponse(
    "/accounts/:accountId/workers/scripts/:scriptName",
    "PUT",
    ([_url, accountId, scriptName], _init, queryParams) => {
      expect(accountId).toEqual("some-account-id");
      expect(scriptName).toEqual("test-name");
      expect(queryParams.get("available_on_subdomains")).toEqual("true");
      return { available_on_subdomain };
    }
  );
}

/** Create a mock handler the request for the account's subdomain. */
function mockSubDomainRequest(subdomain = "test-sub-domain") {
  setMockResponse("/accounts/:accountId/workers/subdomain", () => {
    return { subdomain };
  });
}
