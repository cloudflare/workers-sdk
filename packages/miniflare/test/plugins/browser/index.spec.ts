import test from "ava";
import { Miniflare, MiniflareOptions } from "miniflare";

const BROWSER_WORKER_SCRIPT = () => `
import puppeteer from "@cloudflare/puppeteer";
export default {
	async fetch(request, env) {
		console.log(env.MYBROWSER);
		const { searchParams } = new URL(request.url);
		let url = searchParams.get("url");
		let img;
		if (url) {
			url = new URL(url).toString(); // normalize

			if (url.indexOf("selector")) {
				const allResultsSelector = "h1";
				const browser = await puppeteerModule.exports.launch(env.MYBROWSER);
				const page = await browser.newPage();
				await page.goto(url);
				const text = await page.waitForSelector(allResultsSelector);
				const h1Text = await page.$eval("h1", (el) => el.textContent.trim());
				return new Response(h1Text);
			}

			img = await env.BROWSER_KV_DEMO.get(url, { type: "arrayBuffer" });
			if (img === null) {
				const browser = await puppeteerModule.exports.launch(env.MYBROWSER);
				const page = await browser.newPage();
				await page.goto(url);
				img = await page.screenshot();
				await env.BROWSER_KV_DEMO.put(url, img, {
					expirationTtl: 60 * 60 * 24,
				});
				await browser.close();
			}
			return new Response(img, {
				headers: {
					"content-type": "image/jpeg",
				},
			});
		} else {
			return new Response("Please add an ?url=https://example.com/ parameter");
		}
	},
};
`;

test("it waits for the url query param", async (t) => {
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2024-11-20",
		modules: true,
		script: BROWSER_WORKER_SCRIPT(),
		browser: "MYBROWSER",
	};
	const mf = new Miniflare(opts);
	const res = await mf.dispatchFetch("http://localhost");
	t.is(res.status, 200);
	t.is(await res.text(), "Please add an ?url=https://example.com/ parameter");
	t.teardown(() => mf.dispose());
});

test("it properly selects the head element", async (t) => {
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2025-05-05",
		modules: true,
		script: BROWSER_WORKER_SCRIPT(),
		browser: "MYBROWSER",
	};
	const mf = new Miniflare(opts);
	try {
		const res = await mf.dispatchFetch(
			"http://localhost?url=https://example.com/&select"
		);
		t.is(res.status, 200);
		t.is(await res.text(), "Please add an ?url=https://example.com/ parameter");
	} catch (err) {
		console.log(err);
	} finally {
		t.teardown(() => mf.dispose());
	}
});
