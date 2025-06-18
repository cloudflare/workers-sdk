import fs from "node:fs";

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
	fs.writeFileSync(
		`${basePath}/index.${format}`,
		type === "esm"
			? `import { foo } from "./another";
      export default {
        async fetch(request) {
          return new Response('Hello' + foo);
        },
      };`
			: type === "sw"
				? `import { foo } from "./another";
      addEventListener('fetch', event => {
        event.respondWith(new Response('Hello' + foo));
      })`
				: `from js import Response
def on_fetch(request):
  return Response.new("Hello World")
`
	);
	fs.writeFileSync(`${basePath}/another.${format}`, `export const foo = 100;`);
}
