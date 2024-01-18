import { fetch } from "undici";

type NpmInfoResponse = {
	"dist-tags": { latest: string };
};

/**
 * Get the latest version of an npm package by making a request to the npm REST API.
 */
export async function getLatestPackageVersion(packageSpecifier: string) {
	const resp = await fetch(`https://registry.npmjs.org/${packageSpecifier}`);
	const npmInfo = (await resp.json()) as NpmInfoResponse;
	return npmInfo["dist-tags"].latest;
}
