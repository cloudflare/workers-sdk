import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, test } from "vitest";
import { normalizeOutput } from "../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw, mswListVersions } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("versions list", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	mockConsoleMethods();
	const cnsl = mockConsoleMethods();

	const std = collectCLIOutput();

	beforeEach(() => {
		msw.use(mswListVersions);
	});

	describe("without wrangler.toml", () => {
		test("fails with no args", async ({ expect }) => {
			const result = runWrangler("versions list --json");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("prints versions to stdout", async ({ expect }) => {
			const result = runWrangler("versions list --name test-name");

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  10000000-0000-0000-0000-000000000000
				Created:     2021-01-01T00:00:00.000Z
				Author:      Jean-Luc-Picard@federation.org
				Source:      Upload
				Tag:         -
				Message:     -

				Version ID:  20000000-0000-0000-0000-000000000000
				Created:     2021-01-04T00:00:00.000Z
				Author:      Jean-Luc-Picard@federation.org
				Source:      Rollback
				Tag:         -
				Message:     -

				Version ID:  30000000-0000-0000-0000-000000000000
				Created:     2021-02-02T00:00:00.000Z
				Author:      Kathryn-Janeway@federation.org
				Source:      Rollback
				Tag:         -
				Message:     Rolled back for this version

				Version ID:  40000000-0000-0000-0000-000000000000
				Created:     2021-02-03T00:00:00.000Z
				Author:      Kathryn-Janeway@federation.org
				Source:      Wrangler 🤠
				Tag:         -
				Message:     -

				"
			`);

			expect(cnsl.out).toMatch(/⛅️ wrangler/);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		test("prints versions to stdout as --json", async ({ expect }) => {
			const result = runWrangler("versions list --name test-name --json");

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"[
				  {
				    "id": "10000000-0000-0000-0000-000000000000",
				    "number": "1701-E",
				    "annotations": {
				      "workers/triggered_by": "upload"
				    },
				    "metadata": {
				      "author_id": "Picard-Gamma-6-0-7-3",
				      "author_email": "Jean-Luc-Picard@federation.org",
				      "source": "wrangler",
				      "created_on": "2021-01-01T00:00:00.000000Z",
				      "modified_on": "2021-01-01T00:00:00.000000Z"
				    }
				  },
				  {
				    "id": "20000000-0000-0000-0000-000000000000",
				    "number": "1701-E",
				    "annotations": {
				      "workers/triggered_by": "rollback",
				      "workers/rollback_from": "MOCK-DEPLOYMENT-ID-2222"
				    },
				    "metadata": {
				      "author_id": "Picard-Gamma-6-0-7-3",
				      "author_email": "Jean-Luc-Picard@federation.org",
				      "source": "wrangler",
				      "created_on": "2021-01-04T00:00:00.000000Z",
				      "modified_on": "2021-01-04T00:00:00.000000Z"
				    },
				    "resources": {
				      "script": "test-name",
				      "bindings": []
				    }
				  },
				  {
				    "id": "30000000-0000-0000-0000-000000000000",
				    "number": "NCC-74656",
				    "annotations": {
				      "workers/triggered_by": "rollback",
				      "workers/rollback_from": "MOCK-DEPLOYMENT-ID-1111",
				      "workers/message": "Rolled back for this version"
				    },
				    "metadata": {
				      "author_id": "Kathryn-Jane-Gamma-6-0-7-3",
				      "author_email": "Kathryn-Janeway@federation.org",
				      "source": "wrangler",
				      "created_on": "2021-02-02T00:00:00.000000Z",
				      "modified_on": "2021-02-02T00:00:00.000000Z"
				    }
				  },
				  {
				    "id": "40000000-0000-0000-0000-000000000000",
				    "number": "NCC-74656",
				    "metadata": {
				      "author_id": "Kathryn-Jane-Gamma-6-0-7-3",
				      "author_email": "Kathryn-Janeway@federation.org",
				      "source": "wrangler",
				      "created_on": "2021-02-03T00:00:00.000000Z",
				      "modified_on": "2021-02-03T00:00:00.000000Z"
				    }
				  }
				]
				"
			`);

			expect(cnsl.out).not.toMatch(/⛅️ wrangler/);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(() => writeWranglerConfig());

		test("prints versions to stdout", async ({ expect }) => {
			const result = runWrangler("versions list");

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  10000000-0000-0000-0000-000000000000
				Created:     2021-01-01T00:00:00.000Z
				Author:      Jean-Luc-Picard@federation.org
				Source:      Upload
				Tag:         -
				Message:     -

				Version ID:  20000000-0000-0000-0000-000000000000
				Created:     2021-01-04T00:00:00.000Z
				Author:      Jean-Luc-Picard@federation.org
				Source:      Rollback
				Tag:         -
				Message:     -

				Version ID:  30000000-0000-0000-0000-000000000000
				Created:     2021-02-02T00:00:00.000Z
				Author:      Kathryn-Janeway@federation.org
				Source:      Rollback
				Tag:         -
				Message:     Rolled back for this version

				Version ID:  40000000-0000-0000-0000-000000000000
				Created:     2021-02-03T00:00:00.000Z
				Author:      Kathryn-Janeway@federation.org
				Source:      Wrangler 🤠
				Tag:         -
				Message:     -

				"
			`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		test("prints versions to as --json", async ({ expect }) => {
			const result = runWrangler("versions list --json");

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"[
				  {
				    "id": "10000000-0000-0000-0000-000000000000",
				    "number": "1701-E",
				    "annotations": {
				      "workers/triggered_by": "upload"
				    },
				    "metadata": {
				      "author_id": "Picard-Gamma-6-0-7-3",
				      "author_email": "Jean-Luc-Picard@federation.org",
				      "source": "wrangler",
				      "created_on": "2021-01-01T00:00:00.000000Z",
				      "modified_on": "2021-01-01T00:00:00.000000Z"
				    }
				  },
				  {
				    "id": "20000000-0000-0000-0000-000000000000",
				    "number": "1701-E",
				    "annotations": {
				      "workers/triggered_by": "rollback",
				      "workers/rollback_from": "MOCK-DEPLOYMENT-ID-2222"
				    },
				    "metadata": {
				      "author_id": "Picard-Gamma-6-0-7-3",
				      "author_email": "Jean-Luc-Picard@federation.org",
				      "source": "wrangler",
				      "created_on": "2021-01-04T00:00:00.000000Z",
				      "modified_on": "2021-01-04T00:00:00.000000Z"
				    },
				    "resources": {
				      "script": "test-name",
				      "bindings": []
				    }
				  },
				  {
				    "id": "30000000-0000-0000-0000-000000000000",
				    "number": "NCC-74656",
				    "annotations": {
				      "workers/triggered_by": "rollback",
				      "workers/rollback_from": "MOCK-DEPLOYMENT-ID-1111",
				      "workers/message": "Rolled back for this version"
				    },
				    "metadata": {
				      "author_id": "Kathryn-Jane-Gamma-6-0-7-3",
				      "author_email": "Kathryn-Janeway@federation.org",
				      "source": "wrangler",
				      "created_on": "2021-02-02T00:00:00.000000Z",
				      "modified_on": "2021-02-02T00:00:00.000000Z"
				    }
				  },
				  {
				    "id": "40000000-0000-0000-0000-000000000000",
				    "number": "NCC-74656",
				    "metadata": {
				      "author_id": "Kathryn-Jane-Gamma-6-0-7-3",
				      "author_email": "Kathryn-Janeway@federation.org",
				      "source": "wrangler",
				      "created_on": "2021-02-03T00:00:00.000000Z",
				      "modified_on": "2021-02-03T00:00:00.000000Z"
				    }
				  }
				]
				"
			`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});
