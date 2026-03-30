import { UserError } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { writeRoutesModule } from "../../pages/functions/routes";
import { toUrlPath } from "../../paths";
import { runInTempDir } from "../helpers/run-in-tmp";

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
			).rejects.toThrow(new UserError(`Invalid module path "${modulePath}"`));
		}
	);
});
