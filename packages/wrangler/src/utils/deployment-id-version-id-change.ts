import { logger } from "../logger";

export function logVersionIdChange() {
	const docsLink =
		"https://developers.cloudflare.com/workers/configuration/versions-and-deployments";

	logger.log(
		`\n\nNOTE: "Deployment ID" in this output will be changed to "Version ID" in a future version of Wrangler. To learn more visit: ${docsLink}`
	);
}
