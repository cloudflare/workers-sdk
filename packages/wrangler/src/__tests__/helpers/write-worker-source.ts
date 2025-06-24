import fs from "node:fs";
import dedent from "ts-dedent";

/** Write a mock Worker script to disk. */
export function writeWorkerSource({
	basePath = ".",
	format = "js",
	type = "esm",
}: {
	basePath?: string;
	format?: "js" | "ts" | "jsx" | "tsx" | "mjs" | "py";
	type?: "esm" | "sw" | "python";
} = {}) {
	if (basePath !== ".") {
		fs.mkdirSync(basePath, { recursive: true });
	}

	let workerContent;

	switch (type) {
		case "esm":
			workerContent = /* javascript */ dedent`
				import { foo } from "./another";
				export default {
					async fetch(request) {
					return new Response('Hello' + foo);
					},
				};`;
			break;
		case "sw":
			workerContent = /* javascript */ dedent`
				import { foo } from "./another";
				addEventListener('fetch', event => {
					event.respondWith(new Response('Hello' + foo));
				})`;
			break;
		case "python":
			workerContent = /* python */ dedent`
				from js import Response
				def on_fetch(request):
					return Response.new("Hello World")
				`;
			break;
	}

	fs.writeFileSync(`${basePath}/index.${format}`, workerContent);

	fs.writeFileSync(`${basePath}/another.${format}`, `export const foo = 100;`);
}
