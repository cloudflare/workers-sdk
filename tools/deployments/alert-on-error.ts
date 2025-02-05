/* eslint-disable turbo/no-undeclared-env-vars */
if (require.main === module) {
	let status = [];
	if (process.env.PUBLISH_STATUS === "failure") {
		status.push({
			label: "NPM publish",
			details: "Packages failed to publish",
		});
	}
	const deploymentStatus = JSON.parse(process.env.DEPLOYMENT_STATUS as string);

	for (const [pkg, err] of Object.entries(deploymentStatus)) {
		status.push({
			label: pkg,
			details: err,
		});
	}

	if (status.length > 0) {
		fetch("https://devprod-status-bot.devprod.workers.dev/release-failure", {
			body: JSON.stringify({ status, url: process.env.RUN_URL }),
			headers: {
				"X-Auth-Header": process.env.TOKEN as string,
			},
		});
		process.exitCode = 1;
	}
}
