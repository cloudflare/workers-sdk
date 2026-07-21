import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	PagesFunctionsError,
	PagesFunctionsErrorCode,
	toUrlPath,
	writeRoutesModule,
} from "../index";

describe("routes module", () => {
	runInTempDir();

	it("accepts module paths when srcDir is a relative path", async ({
		expect,
	}) => {
		await expect(
			writeRoutesModule({
				config: {
					routes: [
						{
							routePath: toUrlPath("/"),
							mountPath: toUrlPath("/"),
							module: "hello.js:onRequest",
						},
					],
				},
				srcDir: "functions",
				outfile: "_routes.js",
			})
		).resolves.toBeDefined();
	});

	it("rejects invalid module identifiers", async ({ expect }) => {
		await expect(
			writeRoutesModule({
				config: {
					routes: [
						{
							routePath: toUrlPath("/"),
							mountPath: toUrlPath("/"),
							module: "hello.js:not-valid",
						},
					],
				},
				srcDir: "functions",
				outfile: "_routes.js",
			})
		).rejects.toEqual(
			new PagesFunctionsError(
				'Invalid module identifier "not-valid"',
				PagesFunctionsErrorCode.INVALID_MODULE_IDENTIFIER
			)
		);
	});

	it.skipIf(process.platform !== "win32")(
		"rejects module paths on a different drive",
		async ({ expect }) => {
			const modulePath = String.raw`D:\evil.js`;
			const config = {
				routes: [
					{
						routePath: toUrlPath("/"),
						mountPath: toUrlPath("/"),
						module: modulePath,
					},
				],
			};

			await expect(
				writeRoutesModule({
					config,
					srcDir: String.raw`C:\project`,
					outfile: "_routes.js",
				})
			).rejects.toEqual(
				new PagesFunctionsError(
					`Invalid module path "${modulePath}"`,
					PagesFunctionsErrorCode.INVALID_MODULE_PATH
				)
			);
		}
	);
});
