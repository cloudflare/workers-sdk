import * as fs from "node:fs";
import { unstable_dev } from "../api";
import { Request } from "undici";
import { runInTempDir } from "./helpers/run-in-tmp";

jest.unmock("undici");

describe("unstable_dev", () => {
	it("should return Hello World", async () => {
		const worker = await unstable_dev(
			"src/__tests__/helpers/hello-world-worker.js",
			{},
			{ disableExperimentalWarning: true }
		);
		const resp = await worker.fetch();
		if (resp) {
			const text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
		await worker.stop();
	});
});

describe("unstable dev fetch take multiple types for input", () => {
	runInTempDir();
	it("should pass in a request object unchanged", async () => {
		const scriptContent = `
	  export default {
	    fetch(request, env, ctx) {
				const url = new URL(request.url);
				if (url.pathname === "/test") {
					if (request.method === "POST") {
						return new Response("requestPOST");
					}
					return new Response("requestGET");
				}
	      return new Response('Hello world');
	    }
	  };
	  `;
		fs.writeFileSync("index.js", scriptContent);
		const port = 21212;
		const worker = await unstable_dev(
			"index.js",
			{ port },
			{ disableExperimentalWarning: true }
		);
		const req = new Request("http://localhost:21212/test", {
			method: "POST",
		});
		const resp = await worker.fetch(req);
		let text;
		if (resp) text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"requestPOST"`);
		await worker.stop();
	});

	it("should strip back to pathname for URL objects", async () => {
		const scriptContent = `
	  export default {
	    fetch(request, env, ctx) {
				const url = new URL(request.url);
				if (url.pathname === "/test") {
					return new Response("request");
				}
	      return new Response('Hello world');
	    }
	  };
	  `;
		fs.writeFileSync("index.js", scriptContent);
		const worker = await unstable_dev(
			"index.js",
			{},
			{ disableExperimentalWarning: true }
		);
		const url = new URL("http://localhost:80/test");
		const resp = await worker.fetch(url);
		let text;
		if (resp) text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"request"`);
		await worker.stop();
	});

	it("should allow full url passed in string, and stripped back to pathname", async () => {
		const scriptContent = `
	  export default {
	    fetch(request, env, ctx) {
				const url = new URL(request.url);
				if (url.pathname === "/test") {
					return new Response("request");
				}
	      return new Response('Hello world');
	    }
	  };
	  `;
		fs.writeFileSync("index.js", scriptContent);
		const worker = await unstable_dev(
			"index.js",
			{},
			{ disableExperimentalWarning: true }
		);
		const resp = await worker.fetch("http://example.com/test");
		let text;
		if (resp) text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"request"`);
		await worker.stop();
	});

	it("should allow pathname to be passed in", async () => {
		const scriptContent = `
	  export default {
	    fetch(request, env, ctx) {
				const url = new URL(request.url);
				if (url.pathname === "/test") {
					return new Response("request");
				}
	      return new Response('Hello world');
	    }
	  };
	  `;
		fs.writeFileSync("index.js", scriptContent);
		const worker = await unstable_dev(
			"index.js",
			{},
			{ disableExperimentalWarning: true }
		);
		const resp = await worker.fetch("/test");
		let text;
		if (resp) text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"request"`);
		await worker.stop();
	});

	it("should allow no input be passed in", async () => {
		const scriptContent = `
	  export default {
	    fetch(request, env, ctx) {
				const url = new URL(request.url);
				if (url.pathname === "/test") {
					return new Response("request");
				}
	      return new Response('Hello world');
	    }
	  };
	  `;
		fs.writeFileSync("index.js", scriptContent);
		const worker = await unstable_dev(
			"index.js",
			{},
			{ disableExperimentalWarning: true }
		);
		const resp = await worker.fetch("");
		let text;
		if (resp) text = await resp.text();
		expect(text).toMatchInlineSnapshot(`"Hello world"`);
		await worker.stop();
	});
});
