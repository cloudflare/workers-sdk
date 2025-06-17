import { execFile } from "child_process";

// Returns a list of docker image ids matching the provided repository:[tag]
export async function getDockerImageDigest(
	dockerPath: string,
	imageTag: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			dockerPath,
			["images", "--digests", "--format", "{{.Digest}}", imageTag],
			(error, stdout, stderr) => {
				if (error) {
					return reject(
						new Error(
							`Failed getting docker image digest for image: ${imageTag} with error: ${error}.`
						)
					);
				}
				return resolve(stdout.trim());
			}
		);
	});
}
