import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
	checkPullRequest,
	isOrganizationMember,
	isVouched,
	renderResponse,
} from "./vouch.mjs";

function pullRequestEvent({
	author = "external-contributor",
	authorAssociation = "NONE",
} = {}) {
	return {
		repository: {
			name: "workers-sdk",
			owner: { login: "cloudflare" },
		},
		pull_request: {
			number: 123,
			author_association: authorAssociation,
			user: { login: author },
		},
	};
}

function response(status, body = "") {
	return new Response(body, { status });
}

describe("isOrganizationMember", () => {
	it("accepts organization members and owners", () => {
		assert.equal(isOrganizationMember("MEMBER"), true);
		assert.equal(isOrganizationMember("OWNER"), true);
	});

	it("rejects repository collaborators and contributors", () => {
		assert.equal(isOrganizationMember("COLLABORATOR"), false);
		assert.equal(isOrganizationMember("CONTRIBUTOR"), false);
	});
});

describe("isVouched", () => {
	it("matches exact usernames case-insensitively", () => {
		const contents = "# vouched users\nSomeUser\nother-user\n";

		assert.equal(isVouched("someuser", contents), true);
		assert.equal(isVouched("some", contents), false);
	});

	it("lets an explicit denial override a vouched entry", () => {
		const contents = "some-user\n-some-user\n";

		assert.equal(isVouched("some-user", contents), false);
	});
});

describe("renderResponse", () => {
	it("substitutes every author placeholder", () => {
		assert.equal(
			renderResponse("Hi @{author}. Signed, {author}", "octocat"),
			"Hi @octocat. Signed, octocat"
		);
	});
});

describe("checkPullRequest", () => {
	it("accepts organization members without calling the API", async () => {
		const fetchImpl = mock.fn();

		const result = await checkPullRequest({
			event: pullRequestEvent({ authorAssociation: "MEMBER" }),
			token: "token",
			vouchedContents: "",
			responseTemplate: "Hi @{author}",
			fetchImpl,
		});

		assert.equal(result, "member");
		assert.equal(fetchImpl.mock.callCount(), 0);
	});

	it("accepts vouched users without calling the API", async () => {
		const fetchImpl = mock.fn();

		const result = await checkPullRequest({
			event: pullRequestEvent({ author: "VouchedUser" }),
			token: "token",
			vouchedContents: "voucheduser\n",
			responseTemplate: "Hi @{author}",
			fetchImpl,
		});

		assert.equal(result, "vouched");
		assert.equal(fetchImpl.mock.callCount(), 0);
	});

	it("comments with the rendered response and then closes the pull request", async () => {
		const statuses = [201, 200];
		const fetchImpl = mock.fn(async () => response(statuses.shift()));

		const result = await checkPullRequest({
			event: pullRequestEvent(),
			token: "token",
			vouchedContents: "someone-else\n",
			responseTemplate: "Hi @{author}",
			fetchImpl,
		});

		assert.equal(result, "closed");
		assert.equal(fetchImpl.mock.callCount(), 2);

		const [commentUrl, commentOptions] = fetchImpl.mock.calls[0].arguments;
		assert.equal(
			commentUrl,
			"https://api.github.com/repos/cloudflare/workers-sdk/issues/123/comments"
		);
		assert.equal(commentOptions.method, "POST");
		assert.deepEqual(JSON.parse(commentOptions.body), {
			body: "Hi @external-contributor",
		});

		const [closeUrl, closeOptions] = fetchImpl.mock.calls[1].arguments;
		assert.equal(
			closeUrl,
			"https://api.github.com/repos/cloudflare/workers-sdk/pulls/123"
		);
		assert.equal(closeOptions.method, "PATCH");
		assert.deepEqual(JSON.parse(closeOptions.body), { state: "closed" });
	});

	it("does not close the pull request when commenting fails", async () => {
		const fetchImpl = mock.fn(async () => response(403, "forbidden"));

		await assert.rejects(
			checkPullRequest({
				event: pullRequestEvent(),
				token: "token",
				vouchedContents: "",
				responseTemplate: "Hi @{author}",
				fetchImpl,
			}),
			/returned 403: forbidden/
		);
		assert.equal(fetchImpl.mock.callCount(), 1);
	});
});
