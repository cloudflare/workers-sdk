import { spawnWranglerDev } from "./helpers";

it("should use the environment variable from the .env file", async () => {
	const { wranglerProcess, fetchWhenReady, terminateProcess } =
		spawnWranglerDev("src/module.ts", "src/wrangler.dotenv.toml", 9002);

	try {
		await fetchWhenReady("http://localhost");
		expect(wranglerProcess.stdout?.read().toString()).toContain(
			"the value of foo"
		);
	} finally {
		await terminateProcess();
	}
});
