import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const VOUCHED_FILE = new URL("../VOUCHED.td", import.meta.url);
const RESPONSE_TEMPLATE_FILE = new URL(
	"../vouch-pr-response.md",
	import.meta.url
);

/**
 * Checks whether GitHub identified a pull request author as a member of the
 * organization that owns the repository.
 *
 * @param {string} authorAssociation GitHub's author association value.
 * @returns {boolean} Whether the author is an organization member or owner.
 */
export function isOrganizationMember(authorAssociation) {
	return ["MEMBER", "OWNER"].includes(authorAssociation.toUpperCase());
}

/**
 * Checks a username against the VOUCHED.td trust/denial list.
 *
 * @param {string} username GitHub username to check.
 * @param {string} contents Contents of VOUCHED.td.
 * @returns {boolean} Whether the username is explicitly vouched.
 */
export function isVouched(username, contents) {
	const normalizedUsername = username.toLowerCase();
	const vouched = new Set();
	const denounced = new Set();

	for (const rawLine of contents.split("\n")) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) {
			continue;
		}

		if (line.startsWith("-")) {
			denounced.add(line.slice(1).trim().toLowerCase());
		} else {
			vouched.add(line.toLowerCase());
		}
	}

	return vouched.has(normalizedUsername) && !denounced.has(normalizedUsername);
}

/**
 * Substitutes fields supported by the pull request response template.
 *
 * @param {string} template Response template contents.
 * @param {string} author Pull request author's GitHub username.
 * @returns {string} Rendered response.
 */
export function renderResponse(template, author) {
	return template.replaceAll("{author}", author);
}

/**
 * Calls the GitHub REST API and verifies its response status.
 *
 * @param {object} options Request options.
 * @param {string} options.apiUrl GitHub REST API base URL.
 * @param {string} options.path REST API path.
 * @param {string} options.token GitHub token.
 * @param {string} options.method HTTP method.
 * @param {unknown} options.body JSON request body.
 * @param {number} options.expectedStatus Expected HTTP response status.
 * @param {typeof fetch} options.fetchImpl Fetch implementation.
 * @returns {Promise<void>}
 */
async function githubRequest({
	apiUrl,
	path,
	token,
	method,
	body,
	expectedStatus,
	fetchImpl,
}) {
	const response = await fetchImpl(`${apiUrl}${path}`, {
		method,
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			"User-Agent": "workers-sdk-vouch-workflow",
			"X-GitHub-Api-Version": "2022-11-28",
		},
		body: JSON.stringify(body),
	});

	if (response.status !== expectedStatus) {
		const responseBody = await response.text();
		throw new Error(
			`GitHub API ${method} ${path} returned ${response.status}: ${responseBody}`
		);
	}
}

/**
 * Applies the repository's vouch policy to a pull request event.
 *
 * @param {object} options Vouch options.
 * @param {object} options.event pull_request_target webhook payload.
 * @param {string} options.token GitHub token.
 * @param {string} options.vouchedContents Contents of VOUCHED.td.
 * @param {string} options.responseTemplate Pull request response template.
 * @param {string} [options.apiUrl] GitHub REST API base URL.
 * @param {typeof fetch} [options.fetchImpl] Fetch implementation.
 * @returns {Promise<"member" | "vouched" | "closed">} Policy result.
 */
export async function checkPullRequest({
	event,
	token,
	vouchedContents,
	responseTemplate,
	apiUrl = "https://api.github.com",
	fetchImpl = fetch,
}) {
	const pullRequest = event.pull_request;
	const repository = event.repository;
	const author = pullRequest?.user?.login;

	if (!pullRequest || !repository || !author) {
		throw new Error("The event does not contain pull request metadata");
	}

	if (isOrganizationMember(pullRequest.author_association ?? "")) {
		console.log(`${author} is a member of the repository's organization`);
		return "member";
	}

	if (isVouched(author, vouchedContents)) {
		console.log(`${author} is listed in .github/VOUCHED.td`);
		return "vouched";
	}

	const owner = repository.owner.login;
	const repositoryName = repository.name;
	const pullNumber = pullRequest.number;
	const response = renderResponse(responseTemplate, author);

	await githubRequest({
		apiUrl,
		path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/issues/${pullNumber}/comments`,
		token,
		method: "POST",
		body: { body: response },
		expectedStatus: 201,
		fetchImpl,
	});

	await githubRequest({
		apiUrl,
		path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/pulls/${pullNumber}`,
		token,
		method: "PATCH",
		body: { state: "closed" },
		expectedStatus: 200,
		fetchImpl,
	});

	console.log(
		`Commented on and closed pull request #${pullNumber} from ${author}`
	);
	return "closed";
}

async function main() {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	const token = process.env.GITHUB_TOKEN;

	if (!eventPath || !token) {
		throw new Error("GITHUB_EVENT_PATH and GITHUB_TOKEN must be set");
	}

	const [eventContents, vouchedContents, responseTemplate] = await Promise.all([
		readFile(eventPath, "utf8"),
		readFile(VOUCHED_FILE, "utf8"),
		readFile(RESPONSE_TEMPLATE_FILE, "utf8"),
	]);

	await checkPullRequest({
		event: JSON.parse(eventContents),
		token,
		vouchedContents,
		responseTemplate,
		apiUrl: process.env.GITHUB_API_URL,
	});
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
	await main();
}
