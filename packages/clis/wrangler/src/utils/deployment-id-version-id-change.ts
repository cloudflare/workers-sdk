import { logger } from "../logger";

export function logVersionIdChange() {
	const docsLink =
		"https://developers.cloudflare.com/workers/configuration/versions-and-deployments";

	logger.log(
		`\n\nNote: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: ${docsLink}`
	);
}
