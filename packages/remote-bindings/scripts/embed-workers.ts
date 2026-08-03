import path from "node:path";
import { build } from "esbuild";

const WORKER_PREFIX = "\0worker:";
const templatesDir = path.resolve(import.meta.dirname, "../templates");

export function embedWorkersPlugin() {
	return {
		name: "embed-workers",
		resolveId(id: string) {
			if (!id.startsWith("worker:")) {
				return;
			}
			return `${WORKER_PREFIX}${id.slice("worker:".length)}`;
		},
		async load(id: string) {
			if (!id.startsWith(WORKER_PREFIX)) {
				return;
			}
			const result = await build({
				entryPoints: [
					path.resolve(templatesDir, `${id.slice(WORKER_PREFIX.length)}.ts`),
				],
				platform: "node",
				conditions: ["workerd", "worker", "browser"],
				format: "esm",
				target: "esnext",
				bundle: true,
				write: false,
				external: ["cloudflare:email", "cloudflare:workers"],
			});
			const source = result.outputFiles[0]?.text;
			if (source === undefined) {
				throw new Error(`Failed to bundle Worker ${id}`);
			}
			return `export default ${JSON.stringify(source)};`;
		},
	};
}
