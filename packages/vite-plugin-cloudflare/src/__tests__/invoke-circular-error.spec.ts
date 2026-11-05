import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { onTestFinished, test } from "vitest";

/**
 * Regression test for #16339: an error thrown by a Vite plugin while
 * transforming a module imported by the Worker must reach the Worker as the
 * original error, even if the error carries a field that cannot be serialized
 * (e.g. a circular self-reference).
 *
 * The `__VITE_INVOKE_MODULE__` fetcher handler in `miniflare-options.ts`
 * serializes the module runner invoke result with `MiniflareResponse.json()`.
 * When a transform error has a circular field, `JSON.stringify` throws inside
 * the handler, workerd turns that into a 500 response whose body is the
 * `TypeError` text, and the module runner's `await response.json()` then
 * throws `SyntaxError: Unexpected token 'T', "TypeError:"... is not valid JSON`
 * instead of the original error.
 */
test.for([false, true] as const)(
	"a transform error that cannot be serialized (circular: %s) surfaces as the original error",
	async (circular, { expect }) => {
		const root = fs.realpathSync(
			fs.mkdtempSync(
				path.join(fs.realpathSync(os.tmpdir()), "invoke-error-16339-")
			)
		);
		onTestFinished(() => removeDirSync(root));

		fs.mkdirSync(path.join(root, "src"), { recursive: true });
		fs.writeFileSync(
			path.join(root, "src/index.ts"),
			"import { word } from './word';\nexport default { fetch: () => new Response(word) };\n"
		);
		fs.writeFileSync(path.join(root, "src/word.ts"), "export const word = 'ok';\n");

		const failingTransform = {
			name: "failing-transform",
			transform(_code: string, id: string) {
				if (!id.endsWith("/word.ts")) {
					return undefined;
				}
				const error = new Error("word.ts could not be transformed");
				if (circular) {
					(error as unknown as { self: unknown }).self = error;
				}
				throw error;
			},
		};

		let error: unknown;
		try {
			const server = await createServer({
				root,
				configFile: false,
				logLevel: "silent",
				plugins: [
					cloudflare({
						config: (loadedConfig) => ({
							...loadedConfig,
							worker: {
								...loadedConfig.worker,
								name: "invoke-error",
								entrypoint: "./src/index.ts",
							},
						}),
					}),
					failingTransform,
				],
			});
			await server.close();
		} catch (thrown) {
			error = thrown;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("word.ts could not be transformed");
		// The original error must not be replaced by the JSON `SyntaxError`
		// caused by serializing it.
		expect((error as Error).message).not.toContain("is not valid JSON");
	}
);
