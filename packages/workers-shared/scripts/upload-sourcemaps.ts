// Creates a sentry release with associated sourcemaps
import SentryCli from "@sentry/cli";

const requireEnvVar = (varName: string): string => {
	const varValue = process.env[varName];
	if (varValue === undefined || varValue === "") {
		throw new Error(`Missing required environment variable: ${varName}`);
	}
	return varValue;
};

const requireVar = (varName: string): string => {
	const args = process.argv.slice(2);

	for (let i = 0; i < args.length; i += 2) {
		if (args[i].startsWith("--") && args[i].substring(2) === varName) {
			return args[i + 1];
		}
	}
	throw new Error(`Missing required variable: ${varName}`);
};

// Vars
const targetWorker = requireVar("worker");
const sentryRelease = requireVar("tag");

// EnvVars
const sentryAuthToken = requireEnvVar("WORKERS_SHARED_SENTRY_AUTH_TOKEN");
const sentryAccessClientID = requireEnvVar("WORKERS_SHARED_SENTRY_ACCESS_ID");
const sentryAccessClientSecret = requireEnvVar(
	"WORKERS_SHARED_SENTRY_ACCESS_SECRET"
);

// Add a custom header to get through cf access
const accessHeader = `cf-access-client-id: ${sentryAccessClientID}
cf-access-client-secret: ${sentryAccessClientSecret}`;

async function generateRelease(worker: string, release: string) {
	const dir = `./${worker}/dist`;
	console.log(`Dir path: ${dir}`);

	const sentryCli = new SentryCli(null, {
		org: "cloudflare",
		project: worker,
		url: "https://sentry10.cfdata.org/",
		authToken: sentryAuthToken,
		customHeader: accessHeader,
	});

	console.log(`Creating release: ${release}`);
	await sentryCli.releases.new(release);

	console.log("Finalizing release");
	await sentryCli.releases.finalize(release);

	console.log("Inject debug ids");
	await sentryCli.execute(["sourcemaps", "inject", dir], true);

	console.log("Uploading sourcemaps");
	await sentryCli.releases.uploadSourceMaps(release, {
		include: [dir],
		urlPrefix: "/",
	});
}

generateRelease(targetWorker, sentryRelease)
	.then(() =>
		console.log(`Successfully uploaded sourcemaps for ${targetWorker}`)
	)
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
