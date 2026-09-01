import { describe, test } from "vitest";
import { bindReport, fileSize, render, validate } from "../index.mjs";

function makeReport() {
	const packages = ["wrangler", "miniflare", "@cloudflare/vite-plugin"].map(
		(name) => ({
			name,
			baseline: {
				name,
				raw: 3,
				gzip: 23,
			},
			candidate: {
				name,
				raw: 4,
				gzip: 24,
			},
		})
	);
	return {
		schemaVersion: 1,
		candidateSha: "a".repeat(40),
		baselineSha: "b".repeat(40),
		packages,
	};
}

type Report = ReturnType<typeof makeReport>;

function event() {
	return {
		repository: { full_name: "cloudflare/workers-sdk" },
		workflow_run: {
			head_sha: "c".repeat(40),
			head_branch: "sizes",
			head_repository: { full_name: "contributor/workers-sdk" },
			pull_requests: [{ number: 99 }],
		},
	};
}

function pullRequest(report: Report) {
	return {
		number: 99,
		merge_commit_sha: report.candidateSha,
		head: {
			sha: "c".repeat(40),
			ref: "sizes",
			repo: { full_name: "contributor/workers-sdk" },
		},
		base: { repo: { full_name: "cloudflare/workers-sdk" } },
	};
}

function candidateCommit(report: Report) {
	return {
		sha: report.candidateSha,
		parents: [{ sha: report.baselineSha }, { sha: "c".repeat(40) }],
	};
}

describe("package size report", () => {
	test("normalizes manifest key order", ({ expect }) => {
		expect(fileSize("package.json", Buffer.from('{"a":1,"b":2}'))).toEqual(
			fileSize("package.json", Buffer.from('{"b":2,"a":1}'))
		);
	});

	test("validates and renders deltas", ({ expect }) => {
		expect(render(validate(makeReport()))).toContain(
			"| wrangler | Raw | 3 B | 4 B | +1 B (+33.3%) |\n" +
				"|  | Gzip | 23 B | 24 B | +1 B (+4.3%) |"
		);
	});

	test("binds the artifact to the run, PR, and merge parents", ({ expect }) => {
		const report = validate(makeReport());
		expect(() =>
			bindReport(report, event(), pullRequest(report), candidateCommit(report))
		).not.toThrow();
		const bad = pullRequest(report);
		bad.number = 100;
		expect(() =>
			bindReport(report, event(), bad, candidateCommit(report))
		).toThrow("merge ref");
	});
});
