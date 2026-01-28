/* eslint-disable turbo/no-undeclared-env-vars */
if (require.main === module) {
	const status = [];

	if (process.env.PUBLISH_STATUS === "failure") {
		if (process.env.HAS_CHANGESETS === "true") {
			console.log(
				"Version PR creation failed. Please retry the job if needed."
			);
			process.exit(1);
		}

		status.push({
			label: "NPM publish",
			details: "Packages failed to publish",
		});
	}

	if (process.env.DEPLOYMENT_STATUS) {
		try {
			const deploymentStatus = JSON.parse(
				process.env.DEPLOYMENT_STATUS as string
			);

			for (const [pkg, err] of Object.entries(deploymentStatus)) {
				status.push({
					label: pkg,
					details: err,
				});
			}
		} catch (e) {
			status.push({
				label: "Deployment status",
				details: `Failed to parse deployment status: ${e}. Received: "${process.env.DEPLOYMENT_STATUS}"`,
			});
		}
	}

	if (status.length > 0) {
		void fetch(
			"https://devprod-status-bot.devprod.workers.dev/release-failure",
			{
				body: JSON.stringify({ status, url: process.env.RUN_URL }),
				headers: {
					"X-Auth-Header": process.env.TOKEN as string,
				},
				method: "POST",
			}
		);
		process.exitCode = 1;
	}
}
