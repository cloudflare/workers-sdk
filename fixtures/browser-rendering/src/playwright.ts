import playwright from "@cloudflare/playwright";

export default {
	async fetch(request, env): Promise<Response> {
		const { searchParams } = new URL(request.url);
		let url = searchParams.get("url");
		let action = searchParams.get("action");
		if (url) {
			url = new URL(url).toString(); // normalize
			switch (action) {
				case "select": {
					await using browser = await playwright.launch(env.MYBROWSER);
					const page = await browser.newPage();
					await page.goto(url);
					const h1Text = await page.locator("h1").textContent();
					return new Response(h1Text);
				}

				case "alter": {
					await using browser = await playwright.launch(env.MYBROWSER);
					const page = await browser.newPage();

					await page.goto(url); // change to your target URL

					await page
						.locator("p")
						.first()
						.evaluate((paragraph) => {
							paragraph.textContent = "New paragraph text set by Playwright!";
						});

					const pText = await page.locator("p").first().textContent();
					return new Response(pText);
				}
			}

			let img = await env.BROWSER_KV_DEMO.get(url, { type: "arrayBuffer" });
			if (img === null) {
				await using browser = await playwright.launch(env.MYBROWSER);
				const page = await browser.newPage();
				await page.goto(url);
				img = (await page.screenshot()) as Buffer;
				await env.BROWSER_KV_DEMO.put(url, img, {
					expirationTtl: 60 * 60 * 24,
				});
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
