import { UserError } from "@cloudflare/workers-utils";
import { describe, expect, it, vi } from "vitest";
import { toUrlPath } from "../../paths";

vi.mock("node:path", async (importOriginal) => {
	const path = await importOriginal<typeof import("node:path")>();
	return {
		...path,
		...path.win32,
		default: path.win32,
	};
});

describe("routes module", () => {
	it("rejects module paths on a different drive", async () => {
		const { writeRoutesModule } = await import("../../pages/functions/routes");
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
	});
});
