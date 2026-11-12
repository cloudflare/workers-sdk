import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import ci from "ci-info";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockSetTimeout } from "../helpers/mock-set-timeout";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

describe("pages project upload of a static `functions` directory", () => {
	mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();
	mockSetTimeout();

	beforeEach(() => {
		vi.mocked(ci).isCI = true;
		vi.stubEnv("CF_PAGES_UPLOAD_JWT", "<<funfetti-auth-jwt>>");
	});

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should upload a static `functions` directory inside a build output directory that isn't the project root (#2240)", async ({
		expect,
	}) => {
		// A static site, such as one built with Hugo, whose `public` build output
		// directory has a section called `functions`. `public/functions` is not the
		// project's Pages Functions directory (that would be `./functions`), so its
		// files are ordinary static assets.
		mkdirSync("public/functions", { recursive: true });
		writeFileSync("public/index.html", "<h1>Home</h1>");
		writeFileSync("public/functions/index.html", "<h1>Functions</h1>");

		msw.use(
			http.post(
				"*/pages/assets/check-missing",
				async () =>
					HttpResponse.json(
						{ success: true, errors: [], messages: [], result: [] },
						{ status: 200 }
					),
				{ once: true }
			),
			http.post(
				"*/pages/assets/upsert-hashes",
				async () =>
					HttpResponse.json(
						{ success: true, errors: [], messages: [], result: true },
						{ status: 200 }
					),
				{ once: true }
			)
		);

		await runWrangler(
			"pages project upload public --output-manifest-path=manifest.json"
		);

		const manifest = JSON.parse(readFileSync("manifest.json", "utf-8")) as {
			[path: string]: string;
		};
		expect(Object.keys(manifest).sort()).toEqual([
			"/functions/index.html",
			"/index.html",
		]);
	});
});
