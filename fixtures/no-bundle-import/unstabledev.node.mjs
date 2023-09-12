import { unstable_dev } from "wrangler";

const worker = unstable_dev("./src/index.js", {
	logLevel: "debug",
});
