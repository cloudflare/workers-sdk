import { logger } from "../logger";

export function logVersionIdChange() {
	const docsLink =
		"https://developers.cloudflare.com/workers/configuration/versions-and-deployments";

	logger.log("");
	logger.log("");
	logger.log(
		`NOTE: Deployment ID is now referred to as Version ID. The output of this command will be changing in a future version of Wrangler to reflect this. To learn more visit: ${docsLink}`
	);
}
