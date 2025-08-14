import puppeteer from "@cloudflare/puppeteer";

export default {
	async fetch(request, env): Promise<Response> {
		const { searchParams } = new URL(request.url);
		let url = searchParams.get("url");
		let action = searchParams.get("action");
		if (url) {
			url = new URL(url).toString(); // normalize
			switch (action) {
				case "select": {
					const browser = await puppeteer.launch(env.MYBROWSER);
					const page = await browser.newPage();
					await page.goto(url);
					const h1Text = await page.$eval("h1", (el) => el.textContent.trim());
					return new Response(h1Text);
				}

				case "alter": {
					const browser = await puppeteer.launch(env.MYBROWSER);
					const page = await browser.newPage();

					await page.goto(url); // change to your target URL

					await page.evaluate(() => {
						const paragraph = document.querySelector("p");
						if (paragraph) {
							paragraph.textContent = "New paragraph text set by Puppeteer!";
						}
					});

					const pText = await page.$eval("p", (el) => el.textContent.trim());
					return new Response(pText);
				}

				case "disconnect": {
					const browser = await puppeteer.launch(env.MYBROWSER);
					const sessionId = browser.sessionId();
					await browser.disconnect();
					const sessionInfo = await puppeteer
						.sessions(env.MYBROWSER)
						.then((sessions) =>
							sessions.find((s) => s.sessionId === sessionId)
						);
					return new Response(
						sessionInfo.connectionId
							? "Browser not disconnected"
							: "Browser disconnected"
					);
				}
			}

			let img = await env.BROWSER_KV_DEMO.get(url, { type: "arrayBuffer" });
			if (img === null) {
				const browser = await puppeteer.launch(env.MYBROWSER);
				const page = await browser.newPage();
				await page.goto(url);
				img = (await page.screenshot()) as Buffer;
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
} satisfies ExportedHandler<Env>;
