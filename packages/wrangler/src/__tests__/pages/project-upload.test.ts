// /* eslint-disable no-shadow */
import { mkdirSync, writeFileSync } from "node:fs";
import { rest } from "msw";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockGetUploadTokenRequest } from "../helpers/mock-get-pages-upload-token";
import { mockSetTimeout } from "../helpers/mock-set-timeout";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { UploadPayloadFile } from "../../pages/types";
import type { RestRequest } from "msw";

describe("project upload", () => {
	const ENV_COPY = process.env;
	const std = mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();
	mockSetTimeout();

	beforeEach(() => {
		process.env.CI = "true";
		process.env.CF_PAGES_UPLOAD_JWT = "<<funfetti-auth-jwt>>";
	});

	afterEach(async () => {
		process.env = ENV_COPY;

		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should upload a directory of files with a provided JWT", async () => {
		writeFileSync("logo.png", "foobar");

		msw.use(
			rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
				const body = (await req.json()) as {
					hashes: string[];
				};

				expect(req.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);
				expect(body).toMatchObject({
					hashes: ["2082190357cfd3617ccfe04f340c6247"],
				});

				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: body.hashes,
					})
				);
			}),
			rest.post("*/pages/assets/upload", async (req, res, ctx) => {
				expect(req.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);

				expect(await req.json()).toMatchObject([
					{
						base64: true,
						key: "2082190357cfd3617ccfe04f340c6247",
						metadata: {
							contentType: "image/png",
						},
						value: "Zm9vYmFy",
					},
				]);

				return res(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					})
				);
			})
		);

		await runWrangler("pages project upload .");

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
		"✨ Success! Uploaded 1 files (TIMINGS)

		✨ Upload complete!"
	`);
	});

	it("should avoid uploading some files", async () => {
		mkdirSync("some_dir/node_modules", { recursive: true });
		mkdirSync("some_dir/functions", { recursive: true });

		writeFileSync("logo.png", "foobar");
		writeFileSync("some_dir/functions/foo.js", "func");
		writeFileSync("some_dir/_headers", "headersfile");

		writeFileSync("_headers", "headersfile");
		writeFileSync("_redirects", "redirectsfile");
		writeFileSync("_worker.js", "workerfile");
		writeFileSync("_routes.json", "routesfile");
		mkdirSync(".git");
		writeFileSync(".git/foo", "gitfile");
		writeFileSync("some_dir/node_modules/some_package", "nodefile");
		mkdirSync("functions");
		writeFileSync("functions/foo.js", "func");

		// Accumulate multiple requests then assert afterwards
		const requests: RestRequest[] = [];
		msw.use(
			rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
				const body = (await req.json()) as {
					hashes: string[];
				};

				expect(req.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);
				expect(body).toMatchObject({
					hashes: [
						"2082190357cfd3617ccfe04f340c6247",
						"95dedb64e6d4940fc2e0f11f711cc2f4",
						"09a79777abda8ccc8bdd51dd3ff8e9e9",
					],
				});

				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: body.hashes,
					})
				);
			}),
			rest.post("*/pages/assets/upload", (req, res, ctx) => {
				requests.push(req);

				return res(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					})
				);
			})
		);

		await runWrangler("pages project upload .");
		expect(requests.length).toBe(3);

		const resolvedRequests = (
			await Promise.all(
				requests.map(async (req) => await req.json<UploadPayloadFile[]>())
			)
		).flat();

		const requestMap = resolvedRequests.reduce<{
			[key: string]: UploadPayloadFile;
		}>((map, req) => Object.assign(map, { [req.key]: req }), {});

		for (const req of requests) {
			expect(req.headers.get("Authorization")).toBe(
				"Bearer <<funfetti-auth-jwt>>"
			);
		}

		expect(Object.keys(requestMap).length).toBe(3);

		expect(requestMap["95dedb64e6d4940fc2e0f11f711cc2f4"]).toMatchObject({
			base64: true,
			key: "95dedb64e6d4940fc2e0f11f711cc2f4",
			metadata: {
				contentType: "application/octet-stream",
			},
			value: "aGVhZGVyc2ZpbGU=",
		});

		expect(requestMap["2082190357cfd3617ccfe04f340c6247"]).toMatchObject({
			base64: true,
			key: "2082190357cfd3617ccfe04f340c6247",
			metadata: {
				contentType: "image/png",
			},
			value: "Zm9vYmFy",
		});

		expect(requestMap["09a79777abda8ccc8bdd51dd3ff8e9e9"]).toMatchObject({
			base64: true,
			key: "09a79777abda8ccc8bdd51dd3ff8e9e9",
			metadata: {
				contentType: "application/javascript",
			},
			value: "ZnVuYw==",
		});

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
		"✨ Success! Uploaded 3 files (TIMINGS)

		✨ Upload complete!"
	`);
	});

	it("should retry uploads", async () => {
		writeFileSync("logo.txt", "foobar");

		// Accumulate multiple requests then assert afterwards
		const requests: RestRequest[] = [];
		msw.use(
			rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
				const body = (await req.json()) as { hashes: string[] };

				expect(req.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);
				expect(body).toMatchObject({
					hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
				});

				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: body.hashes,
					})
				);
			}),
			rest.post("*/pages/assets/upload", async (req, res, ctx) => {
				requests.push(req);

				if (requests.length < 2) {
					return res(
						ctx.status(200),
						ctx.json({
							success: false,
							errors: [
								{
									code: 800000,
									message: "Something exploded, please retry",
								},
							],
							messages: [],
							result: null,
						})
					);
				} else {
					return res(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}
			})
		);

		await runWrangler("pages project upload .");

		// Assert two identical requests
		expect(requests.length).toBe(2);
		for (const init of requests) {
			expect(init.headers.get("Authorization")).toBe(
				"Bearer <<funfetti-auth-jwt>>"
			);

			const body = (await init.json()) as UploadPayloadFile[];
			expect(body).toMatchObject([
				{
					key: "1a98fb08af91aca4a7df1764a2c4ddb0",
					value: Buffer.from("foobar").toString("base64"),
					metadata: {
						contentType: "text/plain",
					},
					base64: true,
				},
			]);
		}

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
		"✨ Success! Uploaded 1 files (TIMINGS)

		✨ Upload complete!"
	`);
	});

	it("should try to use multiple buckets (up to the max concurrency)", async () => {
		writeFileSync("logo.txt", "foobar");
		writeFileSync("logo.png", "foobar");
		writeFileSync("logo.html", "foobar");
		writeFileSync("logo.js", "foobar");

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		// Accumulate multiple requests then assert afterwards
		const requests: RestRequest[] = [];
		msw.use(
			rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
				const body = (await req.json()) as { hashes: string[] };

				expect(req.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);
				expect(body).toMatchObject({
					hashes: expect.arrayContaining([
						"d96fef225537c9f5e44a3cb27fd0b492",
						"2082190357cfd3617ccfe04f340c6247",
						"6be321bef99e758250dac034474ddbb8",
						"1a98fb08af91aca4a7df1764a2c4ddb0",
					]),
				});

				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: body.hashes,
					})
				);
			}),
			rest.post("*/pages/assets/upload", async (req, res, ctx) => {
				requests.push(req);

				expect(req.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);

				return res(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					})
				);
			})
		);

		await runWrangler("pages project upload .");

		// We have 3 buckets, so expect 3 uploads
		expect(requests.length).toBe(3);
		const bodies: UploadPayloadFile[][] = [];
		for (const init of requests) {
			bodies.push((await init.json()) as UploadPayloadFile[]);
		}
		// One bucket should end up with 2 files
		expect(bodies.map((b) => b.length).sort()).toEqual([1, 1, 2]);
		// But we don't know the order, so flatten and test without ordering
		expect(bodies.flatMap((b) => b)).toEqual(
			expect.arrayContaining([
				{
					base64: true,
					key: "d96fef225537c9f5e44a3cb27fd0b492",
					metadata: { contentType: "text/html" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "1a98fb08af91aca4a7df1764a2c4ddb0",
					metadata: { contentType: "text/plain" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "6be321bef99e758250dac034474ddbb8",
					metadata: { contentType: "application/javascript" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "2082190357cfd3617ccfe04f340c6247",
					metadata: { contentType: "image/png" },
					value: "Zm9vYmFy",
				},
			])
		);

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
		"✨ Success! Uploaded 4 files (TIMINGS)

		✨ Upload complete!"
	`);
	});

	it("should not error when directory names contain periods and houses a extensionless file", async () => {
		mkdirSync(".well-known");
		// Note: same content as previous test, but since it's a different extension,
		// it hashes to a different value
		writeFileSync(".well-known/foobar", "foobar");

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		msw.use(
			rest.post(
				"*/pages/assets/check-missing",

				async (req, res, ctx) => {
					const body = (await req.json()) as { hashes: string[] };

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["7b764dacfd211bebd8077828a7ddefd7"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}
			),
			rest.post("*/pages/assets/upload", async (req, res, ctx) => {
				expect(req.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);
				const body = (await req.json()) as UploadPayloadFile[];
				expect(body).toMatchObject([
					{
						key: "7b764dacfd211bebd8077828a7ddefd7",
						value: Buffer.from("foobar").toString("base64"),
						metadata: {
							contentType: "application/octet-stream",
						},
						base64: true,
					},
				]);

				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					})
				);
			})
		);

		await runWrangler("pages project upload .");

		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});

/**
 * When uploading assets we print out progress messages that look like:
 *
 * Uploading... (1/4)
 * Uploading... (2/4)
 * Uploading... (4/4)
 *
 * Note that we don't always get a progress message for every item uploaded.
 * These upload counts are not deterministic and can change from test run to test run.
 *
 * Also if you run the tests in --runInBand mode then we never see any of
 * these progress messages in the tests!!
 *
 * So this helper removes these message from the snapshots to keep them consistent.
 */
export function normalizeProgressSteps(str: string): string {
	return str.replace(/Uploading... \(\d\/\d\)\r?\n?/g, "");
}
