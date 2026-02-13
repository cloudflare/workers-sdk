import { writeFileSync } from "node:fs";
import { describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

const decoder = new TextDecoder();
describe("pipe test", () => {
	const consoleSpy = mockConsoleMethods();
	const stdSpy = vi
		.spyOn(process.stdout, "write")
		.mockImplementation(() => true);
	runInTempDir();

	it("should display banner", async ({ expect }) => {
		writeFileSync("wormhole.txt", "passageway");
		await runWrangler(
			`r2 object put bucket-object-test/wormhole.txt --file ./wormhole.txt `
		);
		await runWrangler("r2 object get bucket-object-test/wormhole.txt");

		expect(stdSpy).not.toBeCalled();
		expect(consoleSpy.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Resource location: local

			Use --remote if you want to access the remote instance.

			Creating object "wormhole.txt" in bucket "bucket-object-test".
			Upload complete.

			 ⛅️ wrangler x.x.x
			──────────────────
			Resource location: local

			Use --remote if you want to access the remote instance.

			Downloading "wormhole.txt" from "bucket-object-test".
			Download complete."
		`);
	});

	it("should not display banner in pipe mode", async ({ expect }) => {
		writeFileSync("wormhole.txt", "passageway");
		await runWrangler(
			`r2 object put bucket-object-test/wormhole.txt --file ./wormhole.txt `
		);
		await runWrangler("r2 object get bucket-object-test/wormhole.txt --pipe");

		expect(
			decoder.decode(stdSpy.mock.calls[0][0] as unknown as Uint8Array)
		).toMatchInlineSnapshot(`"passageway"`);
	});
});
