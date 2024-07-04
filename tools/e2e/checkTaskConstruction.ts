/**
 * Turbo only supports caching on the individual task level, but for Wrangler's
 * e2e tests we want to support caching on a more granular basis—at the file level.
 *
 * As such, we construct multiple turbo tasks—one per e2e test file, ensuring that each file's
 * tests can be cached individually.
 *
 * Because Turbo ignores the cache when package.json changes, we can't generate these package.json
 * scripts on the fly in CI, and so we require them to be commited to the repository.
 * Since this is easy to mess up, this script lints turbo.json, the root package.json, and Wrangler's package.json
 * to ensure everything is set up as intended.
 *
 * The intended flow here is that CI will run `pnpm test:e2e:wrangler`, which will trigger turbo to run
 * an individual task for each Wrangler e2e test file. These tasks are defined in the root turbo.json,
 * and correspond to scripts in the Wrangler package. We ensure there's no accidental task name collision
 * across packages by adding `--filter wrangler` to the turbo command, to make it only run tasks in the
 * Wrangler package.
 */
import assert from "assert";
import { readdirSync, readFileSync } from "fs";

// Get a list of e2e test files, each of which should have an associated script
const e2eTests = readdirSync("packages/wrangler/e2e");

const tasks = new Map<string, string>();

for (const file of e2eTests) {
	// Ignore other files in the e2e directory (the README, for instance)
	if (file.endsWith(".test.ts")) {
		const [testName] = file.split(".test.ts");
		tasks.set(`test:e2e:${testName}`, `pnpm test:e2e run ./e2e/${file}`);
	}
}

const wranglerPackageJson = JSON.parse(
	readFileSync("packages/wrangler/package.json", "utf8")
);
for (const [testName, testScript] of tasks) {
	assert(
		wranglerPackageJson.scripts[testName] === testScript,
		`Expected the "${testName}" script in Wrangler's package.json to be equal to "${testScript}". Found "${wranglerPackageJson[testName]}"`
	);
}

const rootPackageJson = JSON.parse(readFileSync("package.json", "utf8"));

const rootScript =
	"dotenv -- turbo --log-order=stream --filter wrangler --concurrency 1 " +
	[...tasks.keys()].join(" ");
assert(
	rootPackageJson.scripts["test:e2e:wrangler"] === rootScript,
	`Expected the "test:e2e:wrangler" script in the root package.json to be equal to:\n\n${rootScript}\n\nFound:\n\n${rootPackageJson.scripts["test:e2e:wrangler"]}\n`
);

const rootTurboJson = JSON.parse(readFileSync("turbo.json", "utf8"));
for (const [testName] of tasks) {
	assert(
		JSON.stringify(rootTurboJson.pipeline[testName]) === "{}",
		`Expected the "${testName}" turbo task to be present in turbo.json`
	);
}
