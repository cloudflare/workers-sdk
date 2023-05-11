export const generateGitHubFetch = ({
	GITHUB_USER,
	GITHUB_API_TOKEN,
}: {
	GITHUB_USER: string;
	GITHUB_API_TOKEN: string;
}) => {
	return (resource: Request | string, init?: RequestInit | Request) => {
		let gitHubRequest = new Request(resource, init);
		gitHubRequest = gitHubRequest.clone();

		gitHubRequest.headers.set(
			"Authorization",
			`Basic ${btoa(`${GITHUB_USER}:${GITHUB_API_TOKEN}`)}`
		);
		gitHubRequest.headers.set(
			"User-Agent",
			"@cloudflare/workers-sdk/packages/prerelease-registry"
		);

		return fetch(gitHubRequest);
	};
};
