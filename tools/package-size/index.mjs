import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const PACKAGES = JSON.parse(
	readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "config.json"))
).packages;
const SHA = /^[0-9a-f]{40}$/;

/** Measures the publishable bytes selected by `pnpm pack`. */
export function measure(workspace) {
	return PACKAGES.map((pkg) => {
		const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "package-size-"));
		try {
			const packed = JSON.parse(
				execFileSync(
					"pnpm",
					["pack", "--json", "--pack-destination", temporaryDirectory],
					{
						cwd: resolve(workspace, pkg.directory),
						encoding: "utf8",
						stdio: ["ignore", "pipe", "inherit"],
					}
				)
			);
			if (
				packed.name !== pkg.name ||
				typeof packed.filename !== "string" ||
				!Array.isArray(packed.files) ||
				packed.files.length === 0 ||
				packed.files.length > 20_000
			) {
				throw new Error(`Invalid pnpm pack output for ${pkg.name}`);
			}
			const tarball = resolve(packed.filename);
			if (
				dirname(tarball) !== temporaryDirectory ||
				!statSync(tarball).isFile()
			) {
				throw new Error("pnpm pack wrote outside its temporary directory");
			}
			const extractionDirectory = resolve(temporaryDirectory, "extracted");
			mkdirSync(extractionDirectory);
			// This extraction runs only in the read-only pull request job.
			execFileSync(
				"tar",
				[
					"-xzf",
					tarball,
					"-C",
					extractionDirectory,
					"--no-same-owner",
					"--no-same-permissions",
				],
				{ stdio: "inherit" }
			);
			const packageRoot = resolve(extractionDirectory, "package");
			let raw = 0;
			let gzip = 0;
			for (const entry of packed.files) {
				const path = assertObject(entry, "Packed file").path;
				if (
					typeof path !== "string" ||
					path.startsWith("/") ||
					path.split("/").includes("..") ||
					path.includes("\\")
				) {
					throw new Error("Invalid packed file path");
				}
				const content = readFileSync(resolve(packageRoot, path));
				const size = fileSize(path, content);
				raw += size.raw;
				gzip += size.gzip;
			}
			return { name: pkg.name, raw, gzip };
		} finally {
			// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- standalone CI utility cannot import unbuilt workspace helpers
			rmSync(temporaryDirectory, { recursive: true, force: true });
		}
	});
}

/** Makes package manifest sizes stable despite nondeterministic key ordering. */
export function fileSize(path, content) {
	const input =
		path === "package.json"
			? Buffer.from(
					`${JSON.stringify(sortJson(JSON.parse(content.toString("utf8"))), undefined, 2)}\n`
				)
			: content;
	return { raw: input.length, gzip: gzipSync(input, { level: 9 }).length };
}

function sortJson(value) {
	if (Array.isArray(value)) return value.map(sortJson);
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b, "en"))
			.map(([key, child]) => [key, sortJson(child)])
	);
}

/** Validates every artifact field consumed by the privileged reporter. */
export function validate(input) {
	const report = assertObject(input, "Report");
	if (
		report.schemaVersion !== 1 ||
		typeof report.candidateSha !== "string" ||
		!SHA.test(report.candidateSha) ||
		typeof report.baselineSha !== "string" ||
		!SHA.test(report.baselineSha) ||
		!Array.isArray(report.packages) ||
		report.packages.length !== PACKAGES.length
	) {
		throw new Error("Invalid report metadata");
	}
	return {
		schemaVersion: 1,
		candidateSha: report.candidateSha,
		baselineSha: report.baselineSha,
		packages: report.packages.map((inputPackage, index) => {
			const comparison = assertObject(inputPackage, "Package comparison");
			const name = PACKAGES[index]?.name;
			if (name === undefined || comparison.name !== name) {
				throw new Error("Unexpected package name or order");
			}
			return {
				name,
				baseline: measurement(comparison.baseline, name),
				candidate: measurement(comparison.candidate, name),
			};
		}),
	};
}

function measurement(input, name) {
	const value = assertObject(input, "Measurement");
	if (value.name !== name || !byteCount(value.raw) || !byteCount(value.gzip)) {
		throw new Error(`Invalid ${name} measurement`);
	}
	return { name, raw: value.raw, gzip: value.gzip };
}

/** Binds untrusted artifact data to trusted workflow and GitHub API data. */
export function bindReport(report, event, pullRequest, candidateCommit) {
	const workflowEvent = assertObject(event, "Event");
	const repository = assertObject(workflowEvent.repository, "Repository");
	const run = assertObject(workflowEvent.workflow_run, "Workflow run");
	if (!Array.isArray(run.pull_requests) || run.pull_requests.length === 0) {
		throw new Error("Workflow run has no pull request");
	}
	const workflowPull = assertObject(run.pull_requests[0], "Workflow PR");
	const pull = assertObject(pullRequest, "Pull request");
	const head = assertObject(pull.head, "PR head");
	const base = assertObject(pull.base, "PR base");
	if (
		pull.number !== workflowPull.number ||
		head.sha !== run.head_sha ||
		head.ref !== run.head_branch ||
		assertObject(head.repo, "Head repo").full_name !==
			assertObject(run.head_repository, "Run head repo").full_name ||
		assertObject(base.repo, "Base repo").full_name !== repository.full_name ||
		pull.merge_commit_sha !== report.candidateSha
	) {
		throw new Error("Report does not match the PR merge ref");
	}
	const commit = assertObject(candidateCommit, "Commit");
	if (
		commit.sha !== report.candidateSha ||
		!Array.isArray(commit.parents) ||
		commit.parents.length !== 2 ||
		assertObject(commit.parents[0], "First parent").sha !==
			report.baselineSha ||
		assertObject(commit.parents[1], "Second parent").sha !== run.head_sha
	) {
		throw new Error("Candidate merge parents do not match");
	}
}

/** Renders fixed Markdown from validated fields. */
export function render(report) {
	const lines = [
		"## Package size report",
		"",
		`Candidate: \`${report.candidateSha}\``,
		`Baseline: \`${report.baselineSha}\` (first merge parent)`,
		"",
		"| Package | Metric | Base | Merge | Delta |",
		"| --- | --- | ---: | ---: | ---: |",
	];
	for (const pkg of report.packages) {
		lines.push(
			`| ${pkg.name} | Raw | ${bytes(pkg.baseline.raw)} | ${bytes(pkg.candidate.raw)} | ${delta(pkg.baseline.raw, pkg.candidate.raw)} |`,
			`|  | Gzip | ${bytes(pkg.baseline.gzip)} | ${bytes(pkg.candidate.gzip)} | ${delta(pkg.baseline.gzip, pkg.candidate.gzip)} |`
		);
	}
	lines.push(
		"",
		"Raw and level-9 gzip use packed bytes with manifest keys normalized."
	);
	return `${lines.join("\n")}\n`;
}

function assertObject(value, name) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${name} must be an object`);
	}
	return value;
}

function byteCount(value) {
	return Number.isSafeInteger(value) && value >= 0;
}

function bytes(value) {
	return `${value.toLocaleString("en-US")} B`;
}

function delta(baseline, candidate) {
	const difference = candidate - baseline;
	const sign = difference > 0 ? "+" : "";
	const percent =
		baseline === 0
			? candidate === 0
				? "0.0%"
				: "new"
			: `${sign}${((difference / baseline) * 100).toFixed(1)}%`;
	return `${sign}${difference.toLocaleString("en-US")} B (${percent})`;
}

function argument(name) {
	const index = process.argv.indexOf(name);
	const value = process.argv[index + 1];
	if (index === -1 || value === undefined) throw new Error(`Missing ${name}`);
	return value;
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: "wx" });
}

function measurementFile(path) {
	const values = readJson(path);
	if (!Array.isArray(values) || values.length !== PACKAGES.length) {
		throw new Error("Unexpected measurement package list");
	}
	return values.map((value, index) =>
		measurement(value, PACKAGES[index]?.name ?? "")
	);
}

function buildPackages(workspace, cacheDirectory) {
	execFileSync(
		"pnpm",
		[
			"--dir",
			workspace,
			"run",
			"build",
			...PACKAGES.flatMap(({ name }) => ["--filter", name]),
			"--cache-dir",
			cacheDirectory,
		],
		{ stdio: "inherit" }
	);
}

function main() {
	const command = process.argv[2];
	if (command === "build") {
		buildPackages(argument("--workspace"), argument("--cache-dir"));
		return;
	}
	if (command === "measure") {
		writeJson(argument("--output"), measure(argument("--workspace")));
		return;
	}
	if (command === "combine") {
		const baseline = measurementFile(argument("--baseline"));
		const candidate = measurementFile(argument("--candidate"));
		writeJson(
			argument("--output"),
			validate({
				schemaVersion: 1,
				candidateSha: argument("--candidate-sha"),
				baselineSha: argument("--baseline-sha"),
				packages: PACKAGES.map((pkg, index) => ({
					name: pkg.name,
					baseline: baseline[index],
					candidate: candidate[index],
				})),
			})
		);
		return;
	}
	const report = validate(readJson(argument("--input")));
	if (command === "summary") {
		process.stdout.write(render(report));
		return;
	}
	if (command === "report") {
		bindReport(
			report,
			readJson(argument("--event")),
			readJson(argument("--pull-request-json")),
			readJson(argument("--candidate-commit-json"))
		);
		writeFileSync(argument("--output"), render(report), { flag: "wx" });
		return;
	}
	throw new Error("Unknown package-size command");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
