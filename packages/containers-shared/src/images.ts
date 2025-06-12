import { execFile } from "child_process";

// Returns a list of docker image ids matching the provided repository:[tag]
export async function getDockerImageIds(
	dockerPath: string,
	imageTag: string
): Promise<string[]> {
	return new Promise((resolve, reject) => {
		execFile(
			dockerPath,
			["images", imageTag, "-q"],
			(error, stdout, stderr) => {
				if (error) {
					return reject(
						new Error(
							`Failed getting docker image id for image: ${imageTag} with error: ${error}.`
						)
					);
				}
				return resolve(
					stdout
						.split(/\r\n|\n/)
						.filter((id) => id !== "")
						.map((id) => id.trim())
				);
			}
		);
	});
}
