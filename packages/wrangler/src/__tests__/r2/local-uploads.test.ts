import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("r2 bucket local-uploads", () => {
	const std = mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();

	describe("help", () => {
		it("should show help when the local-uploads command is passed", async () => {
			await runWrangler("r2 bucket local-uploads");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler r2 bucket local-uploads

				Manage local uploads configuration for an R2 bucket

				COMMANDS
				  wrangler r2 bucket local-uploads get <bucket>      Get the local uploads configuration for an R2 bucket
				  wrangler r2 bucket local-uploads enable <bucket>   Enable local uploads for an R2 bucket
				  wrangler r2 bucket local-uploads disable <bucket>  Disable local uploads for an R2 bucket

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});
	});

	describe("get", () => {
		it("should display enabled status when local uploads is enabled", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/r2/buckets/:bucketName/local-uploads",
					async ({ params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("some-account-id");
						expect(bucketName).toEqual("my-bucket");
						return HttpResponse.json(createFetchResult({ enabled: true }));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 bucket local-uploads get my-bucket");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Local uploads are enabled for bucket 'my-bucket'. Object data is written to the nearest region first, then asynchronously replicated to the bucket's primary region."
			`);
		});

		it("should display disabled status when local uploads is disabled", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/r2/buckets/:bucketName/local-uploads",
					async ({ params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("some-account-id");
						expect(bucketName).toEqual("my-bucket");
						return HttpResponse.json(createFetchResult({ enabled: false }));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 bucket local-uploads get my-bucket");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Local uploads are disabled for bucket 'my-bucket'. Object data is written directly to the bucket's primary region."
			`);
		});

		it("should error if bucket name is not provided", async () => {
			await expect(() =>
				runWrangler("r2 bucket local-uploads get")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);
		});
	});

	describe("enable", () => {
		const { setIsTTY } = useMockIsTTY();

		it("should enable local uploads with confirmation", async () => {
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to enable local uploads for bucket 'my-bucket'? Object data will be written to the nearest region first, then asynchronously replicated to the bucket's primary region.`,
				result: true,
			});

			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/local-uploads",
					async ({ request, params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("some-account-id");
						expect(bucketName).toEqual("my-bucket");
						const body = (await request.json()) as { enabled: boolean };
						expect(body.enabled).toEqual(true);
						return HttpResponse.json(createFetchResult({ enabled: true }));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 bucket local-uploads enable my-bucket");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Enabling local uploads for bucket 'my-bucket'...
				✨ Local uploads enabled for bucket 'my-bucket'."
			`);
		});

		it("should enable local uploads with --force flag without confirmation", async () => {
			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/local-uploads",
					async ({ request, params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("some-account-id");
						expect(bucketName).toEqual("my-bucket");
						const body = (await request.json()) as { enabled: boolean };
						expect(body.enabled).toEqual(true);
						return HttpResponse.json(createFetchResult({ enabled: true }));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 bucket local-uploads enable my-bucket --force");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Enabling local uploads for bucket 'my-bucket'...
				✨ Local uploads enabled for bucket 'my-bucket'."
			`);
		});

		it("should enable local uploads with -y flag without confirmation", async () => {
			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/local-uploads",
					async ({ request, params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("some-account-id");
						expect(bucketName).toEqual("my-bucket");
						const body = (await request.json()) as { enabled: boolean };
						expect(body.enabled).toEqual(true);
						return HttpResponse.json(createFetchResult({ enabled: true }));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 bucket local-uploads enable my-bucket -y");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Enabling local uploads for bucket 'my-bucket'...
				✨ Local uploads enabled for bucket 'my-bucket'."
			`);
		});

		it("should cancel enable when confirmation is declined", async () => {
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to enable local uploads for bucket 'my-bucket'? Object data will be written to the nearest region first, then asynchronously replicated to the bucket's primary region.`,
				result: false,
			});

			await runWrangler("r2 bucket local-uploads enable my-bucket");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Enable cancelled."
			`);
		});

		it("should error if bucket name is not provided", async () => {
			await expect(() =>
				runWrangler("r2 bucket local-uploads enable")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);
		});
	});

	describe("disable", () => {
		const { setIsTTY } = useMockIsTTY();

		it("should disable local uploads with confirmation", async () => {
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to disable local uploads for bucket 'my-bucket'? Object data will be written directly to the bucket's primary region.`,
				result: true,
			});

			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/local-uploads",
					async ({ request, params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("some-account-id");
						expect(bucketName).toEqual("my-bucket");
						const body = (await request.json()) as { enabled: boolean };
						expect(body.enabled).toEqual(false);
						return HttpResponse.json(createFetchResult({ enabled: false }));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 bucket local-uploads disable my-bucket");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Disabling local uploads for bucket 'my-bucket'...
				Local uploads disabled for bucket 'my-bucket'."
			`);
		});

		it("should disable local uploads with --force flag without confirmation", async () => {
			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/local-uploads",
					async ({ request, params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("some-account-id");
						expect(bucketName).toEqual("my-bucket");
						const body = (await request.json()) as { enabled: boolean };
						expect(body.enabled).toEqual(false);
						return HttpResponse.json(createFetchResult({ enabled: false }));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 bucket local-uploads disable my-bucket --force");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Disabling local uploads for bucket 'my-bucket'...
				Local uploads disabled for bucket 'my-bucket'."
			`);
		});

		it("should disable local uploads with -y flag without confirmation", async () => {
			msw.use(
				http.put(
					"*/accounts/:accountId/r2/buckets/:bucketName/local-uploads",
					async ({ request, params }) => {
						const { accountId, bucketName } = params;
						expect(accountId).toEqual("some-account-id");
						expect(bucketName).toEqual("my-bucket");
						const body = (await request.json()) as { enabled: boolean };
						expect(body.enabled).toEqual(false);
						return HttpResponse.json(createFetchResult({ enabled: false }));
					},
					{ once: true }
				)
			);

			await runWrangler("r2 bucket local-uploads disable my-bucket -y");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Disabling local uploads for bucket 'my-bucket'...
				Local uploads disabled for bucket 'my-bucket'."
			`);
		});

		it("should cancel disable when confirmation is declined", async () => {
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to disable local uploads for bucket 'my-bucket'? Object data will be written directly to the bucket's primary region.`,
				result: false,
			});

			await runWrangler("r2 bucket local-uploads disable my-bucket");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Disable cancelled."
			`);
		});

		it("should error if bucket name is not provided", async () => {
			await expect(() =>
				runWrangler("r2 bucket local-uploads disable")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);
		});
	});
});
