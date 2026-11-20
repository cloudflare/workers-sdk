import { readFile, writeFile } from "node:fs/promises";
import { transform } from "rolldown/experimental";

const [source, destination] = process.argv.slice(2);
if (source === undefined || destination === undefined) {
	throw new Error(
		"Usage: node tools/build/transform.mjs <source> <destination>"
	);
}
const result = await transform(source, await readFile(source, "utf8"));
if (result.errors.length > 0) {
	throw new AggregateError(result.errors, `Unable to transform ${source}`);
}
await writeFile(destination, result.code);
