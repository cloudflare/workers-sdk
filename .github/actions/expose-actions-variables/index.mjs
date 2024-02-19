import fs from "node:fs";

fs.appendFileSync(
	process.env.GITHUB_ENV,
	`GITHUB_ACTIONS_RUNTIME_TOKEN=${process.env.ACTIONS_RUNTIME_TOKEN}\n` +
		`GITHUB_ACTIONS_RESULTS_URL=${process.env.ACTIONS_RESULTS_URL}\n`
);
