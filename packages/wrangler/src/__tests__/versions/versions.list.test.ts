import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, test } from "vitest";
import { normalizeOutput } from "../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw, mswListVersions } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import type { ApiVersion } from "../../versions/types";

describe("versions list", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	mockConsoleMethods();
	const cnsl = mockConsoleMethods();

	const std = collectCLIOutput();

	function createMockVersion(index: number): ApiVersion {
		const versionNumber = index + 1;
		const paddedVersionNumber = versionNumber.toString().padStart(8, "0");
		const paddedDay = versionNumber.toString().padStart(2, "0");
		const timestamp = `2021-01-${paddedDay}T00:00:00.000000Z`;

		return {
			id: `${paddedVersionNumber}-0000-0000-0000-000000000000`,
			number: versionNumber,
			metadata: {
				author_id: "Picard-Gamma-6-0-7-3",
				author_email: "Jean-Luc-Picard@federation.org",
				created_on: timestamp,
				modified_on: timestamp,
				source: "wrangler",
			},
			resources: {
				bindings: [],
				script: {
					etag: "etag",
					handlers: ["fetch"],
					last_deployed_from: "wrangler",
				},
				script_runtime: {
					compatibility_date: "2021-01-01",
					compatibility_flags: [],
					limits: { cpu_ms: 50 },
					usage_model: "standard",
				},
			},
		};
	}

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

		test("prints versions to stdout as valid json", async ({ expect }) => {
			const result = runWrangler("versions list --name test-name --json");

			await expect(result).resolves.toBeUndefined();

			expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
				[
				  {
				    "annotations": {
				      "workers/triggered_by": "upload",
				    },
				    "id": "10000000-0000-0000-0000-000000000000",
				    "metadata": {
				      "author_email": "Jean-Luc-Picard@federation.org",
				      "author_id": "Picard-Gamma-6-0-7-3",
				      "created_on": "2021-01-01T00:00:00.000000Z",
				      "modified_on": "2021-01-01T00:00:00.000000Z",
				      "source": "wrangler",
				    },
				    "number": "1701-E",
				  },
				  {
				    "annotations": {
				      "workers/rollback_from": "MOCK-DEPLOYMENT-ID-2222",
				      "workers/triggered_by": "rollback",
				    },
				    "id": "20000000-0000-0000-0000-000000000000",
				    "metadata": {
				      "author_email": "Jean-Luc-Picard@federation.org",
				      "author_id": "Picard-Gamma-6-0-7-3",
				      "created_on": "2021-01-04T00:00:00.000000Z",
				      "modified_on": "2021-01-04T00:00:00.000000Z",
				      "source": "wrangler",
				    },
				    "number": "1701-E",
				    "resources": {
				      "bindings": [],
				      "script": "test-name",
				    },
				  },
				  {
				    "annotations": {
				      "workers/message": "Rolled back for this version",
				      "workers/rollback_from": "MOCK-DEPLOYMENT-ID-1111",
				      "workers/triggered_by": "rollback",
				    },
				    "id": "30000000-0000-0000-0000-000000000000",
				    "metadata": {
				      "author_email": "Kathryn-Janeway@federation.org",
				      "author_id": "Kathryn-Jane-Gamma-6-0-7-3",
				      "created_on": "2021-02-02T00:00:00.000000Z",
				      "modified_on": "2021-02-02T00:00:00.000000Z",
				      "source": "wrangler",
				    },
				    "number": "NCC-74656",
				  },
				  {
				    "id": "40000000-0000-0000-0000-000000000000",
				    "metadata": {
				      "author_email": "Kathryn-Janeway@federation.org",
				      "author_id": "Kathryn-Jane-Gamma-6-0-7-3",
				      "created_on": "2021-02-03T00:00:00.000000Z",
				      "modified_on": "2021-02-03T00:00:00.000000Z",
				      "source": "wrangler",
				    },
				    "number": "NCC-74656",
				  },
				]
			`);

			expect(cnsl.out).not.toMatch(/⛅️ wrangler/);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		test("prints the 10 most recent versions to stdout as valid json", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/scripts/:workerName/versions",
					({ request }) => {
						const url = new URL(request.url);
						expect(url.searchParams.get("deployable")).toBe("true");
						expect(url.searchParams.has("per_page")).toBe(false);

						return HttpResponse.json(
							createFetchResult({
								items: Array.from({ length: 12 }, (_, index) =>
									createMockVersion(index)
								),
							})
						);
					}
				)
			);

			const result = runWrangler("versions list --name test-name --json");

			await expect(result).resolves.toBeUndefined();

			const versions = JSON.parse(std.out) as ApiVersion[];
			expect(versions.map((version) => version.id)).toMatchInlineSnapshot(`
				[
				  "00000003-0000-0000-0000-000000000000",
				  "00000004-0000-0000-0000-000000000000",
				  "00000005-0000-0000-0000-000000000000",
				  "00000006-0000-0000-0000-000000000000",
				  "00000007-0000-0000-0000-000000000000",
				  "00000008-0000-0000-0000-000000000000",
				  "00000009-0000-0000-0000-000000000000",
				  "00000010-0000-0000-0000-000000000000",
				  "00000011-0000-0000-0000-000000000000",
				  "00000012-0000-0000-0000-000000000000",
				]
			`);

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

		test("prints versions as valid json", async ({ expect }) => {
			const result = runWrangler("versions list --json");

			await expect(result).resolves.toBeUndefined();

			expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
				[
				  {
				    "annotations": {
				      "workers/triggered_by": "upload",
				    },
				    "id": "10000000-0000-0000-0000-000000000000",
				    "metadata": {
				      "author_email": "Jean-Luc-Picard@federation.org",
				      "author_id": "Picard-Gamma-6-0-7-3",
				      "created_on": "2021-01-01T00:00:00.000000Z",
				      "modified_on": "2021-01-01T00:00:00.000000Z",
				      "source": "wrangler",
				    },
				    "number": "1701-E",
				  },
				  {
				    "annotations": {
				      "workers/rollback_from": "MOCK-DEPLOYMENT-ID-2222",
				      "workers/triggered_by": "rollback",
				    },
				    "id": "20000000-0000-0000-0000-000000000000",
				    "metadata": {
				      "author_email": "Jean-Luc-Picard@federation.org",
				      "author_id": "Picard-Gamma-6-0-7-3",
				      "created_on": "2021-01-04T00:00:00.000000Z",
				      "modified_on": "2021-01-04T00:00:00.000000Z",
				      "source": "wrangler",
				    },
				    "number": "1701-E",
				    "resources": {
				      "bindings": [],
				      "script": "test-name",
				    },
				  },
				  {
				    "annotations": {
				      "workers/message": "Rolled back for this version",
				      "workers/rollback_from": "MOCK-DEPLOYMENT-ID-1111",
				      "workers/triggered_by": "rollback",
				    },
				    "id": "30000000-0000-0000-0000-000000000000",
				    "metadata": {
				      "author_email": "Kathryn-Janeway@federation.org",
				      "author_id": "Kathryn-Jane-Gamma-6-0-7-3",
				      "created_on": "2021-02-02T00:00:00.000000Z",
				      "modified_on": "2021-02-02T00:00:00.000000Z",
				      "source": "wrangler",
				    },
				    "number": "NCC-74656",
				  },
				  {
				    "id": "40000000-0000-0000-0000-000000000000",
				    "metadata": {
				      "author_email": "Kathryn-Janeway@federation.org",
				      "author_id": "Kathryn-Jane-Gamma-6-0-7-3",
				      "created_on": "2021-02-03T00:00:00.000000Z",
				      "modified_on": "2021-02-03T00:00:00.000000Z",
				      "source": "wrangler",
				    },
				    "number": "NCC-74656",
				  },
				]
			`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});
