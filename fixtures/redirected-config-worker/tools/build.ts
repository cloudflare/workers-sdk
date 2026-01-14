import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "fs";

// Create a pseudo build directory
rmSync("build", { recursive: true, force: true });
mkdirSync("build");
const config = {
	name: "redirected-config-worker",
	compatibility_date: "2024-12-01",
	main: "index.js",
	definedEnvironments: ["prod", "staging"],
	targetEnvironment: process.env.CLOUDFLARE_ENV,
	vars: { generated: process.env.CLOUDFLARE_ENV ?? "none" },
};
writeFileSync("build/wrangler.json", JSON.stringify(config, undefined, 2));
copyFileSync("src/index.js", "build/index.js");

// Create the redirect file
rmSync(".wrangler/deploy", { recursive: true, force: true });
mkdirSync(".wrangler/deploy", { recursive: true });
const redirect = { configPath: "../../build/wrangler.json" };
writeFileSync(
	".wrangler/deploy/config.json",
	JSON.stringify(redirect, undefined, 2)
);
