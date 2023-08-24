import { Miniflare } from "miniflare";

export function createProxyWorker(): Miniflare {
	const miniflare = new Miniflare({
		script: `
      export default {
        fetch(request) {

        }
      }
    `,
	});
}
