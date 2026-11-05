import { fileURLToPath } from "node:url";
import { createBuilder, preview } from "vite";
import { describe, test } from "vitest";
import { cloudflare } from "../index";

const fixturesPath = fileURLToPath(
	new URL("./fixtures/preview-runtime-failure", import.meta.url)
);

describe("preview server after a failed Worker start", () => {
	test("a Worker that fails to start doesn't poison later `preview()` calls in the same process", async ({
		expect,
	}) => {
		const config = {
			root: fixturesPath,
			logLevel: "silent",
			plugins: [cloudflare({ persistState: false })],
		};

		const builder = await createBuilder(config);
		await builder.buildApp();

		// Boots a preview server, makes a request to it like the CLI in #16346
		// does, then closes it, returning whichever error the close surfaces.
		const bootPreview = async (): Promise<Error | undefined> => {
			const server = await preview({ ...config, preview: { port: 0 } });
			const [url] = server.resolvedUrls?.local ?? [];
			await fetch(url).catch(() => undefined);
			return server.close().then(
				() => undefined,
				(closeError: Error) => closeError
			);
		};

		// The first boot serves a Worker that `workerd` refuses to start, so
		// closing the server surfaces the runtime startup failure.
		const firstError = await bootPreview();
		expect(firstError?.message).toMatch(/The Workers runtime failed to start/);

		// The second boot in the same process should fail the same way, instead
		// of throwing `Cannot use disposed instance` at the disposed Miniflare.
		const secondError = await bootPreview();
		expect(secondError?.message).not.toMatch(/disposed/i);
		expect(secondError?.message).toMatch(/The Workers runtime failed to start/);
	});
});
