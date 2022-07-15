import { spawnWranglerDev } from "./helpers";

it("renders", async () => {
	const { fetchWhenReady, terminateProcess } = spawnWranglerDev(
		"src/module.ts",
		"src/wrangler.module.toml",
		9001
	);

	try {
		const response = await fetchWhenReady("http://localhost");
		const text = await response.text();
		expect(text).toMatchInlineSnapshot(`
		"{
		  \\"VAR1\\": \\"value1\\",
		  \\"VAR2\\": 123,
		  \\"VAR3\\": {
		    \\"abc\\": \\"def\\"
		  },
		  \\"text\\": \\"Here be some text\\",
		  \\"data\\": \\"Here be some data\\",
		  \\"NODE_ENV\\": \\"local-testing\\"
		}"
	`);
	} finally {
		await terminateProcess();
	}
});
