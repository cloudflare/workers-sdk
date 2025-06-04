import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "fs";

// Create a pseudo build directory
rmSync("build", { recursive: true, force: true });
mkdirSync("build");
const config = {
	name: "redirected-config-worker",
	compatibility_date: "2024-12-01",
	pages_build_output_dir: "./public",
	vars: { generated: true },
};
writeFileSync("build/wrangler.json", JSON.stringify(config, undefined, 2));

mkdirSync("build/public");
copyFileSync("src/index.js", "build/public/_worker.js");

// Create the redirect file
rmSync(".wrangler/deploy", { recursive: true, force: true });
mkdirSync(".wrangler/deploy", { recursive: true });
const redirect = { configPath: "../../build/wrangler.json" };
writeFileSync(
	".wrangler/deploy/config.json",
	JSON.stringify(redirect, undefined, 2)
);
