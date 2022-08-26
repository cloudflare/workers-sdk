import { spawnWranglerDev } from "./helpers";
console.log(spawnWranglerDev);
// TODO: figure out if this test adds any value and how to use unstable_dev for it
it.todo(
	"should use the environment variable from the .env file"
	// async () => {
	// 	const { wranglerProcess, fetchWhenReady, terminateProcess } =
	// 		spawnWranglerDev("src/module.ts", "src/wrangler.dotenv.toml", 9002);

	// 	try {
	// 		await fetchWhenReady("http://localhost");
	// 		expect(wranglerProcess.stdout?.read().toString()).toContain(
	// 			"the value of foo"
	// 		);
	// 	} finally {
	// 		await terminateProcess();
	// 	}
	// }
);
