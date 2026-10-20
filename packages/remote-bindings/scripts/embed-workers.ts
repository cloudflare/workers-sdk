import path from "node:path";
import { bundleWorker } from "../../../tools/build/bundle-worker.mjs";

const WORKER_PREFIX = "\0worker:";
const templatesDir = path.resolve(import.meta.dirname, "../templates");

/** Bundle Worker templates into source strings and track nested imports. */
export function embedWorkersPlugin(templateRoot = templatesDir) {
	return {
		name: "embed-workers",
		resolveId(id: string) {
			if (!id.startsWith("worker:")) {
				return;
			}
			return `${WORKER_PREFIX}${id.slice("worker:".length)}`;
		},
		async load(this: { addWatchFile: (id: string) => void }, id: string) {
			if (!id.startsWith(WORKER_PREFIX)) {
				return;
			}
			const result = await bundleWorker({
				input: path.resolve(
					templateRoot,
					`${id.slice(WORKER_PREFIX.length)}.ts`
				),
			});
			for (const file of result.watchFiles) {
				this.addWatchFile(file);
			}
			return `export default ${JSON.stringify(result.code)};`;
		},
	};
}
