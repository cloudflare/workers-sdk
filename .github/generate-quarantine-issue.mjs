import { readFileSync, readdirSync, rmSync } from "fs";
import assert from "assert";
import { exec } from "child_process";
import { fetch } from "undici";

rmSync(".turbo/runs", { force: true, recursive: true });

const data = await fetch(
	"https://api.github.com/repos/cloudflare/workers-sdk/issues/4294",
	{
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
	}
).then((r) => r.json());

const packageList = data.body
	.split("<!-- START-LIST -->")[1]
	.split("<!-- END-LIST -->")[0]
	.trim()
	.split("\n");

const quarantined = Object.fromEntries(
	packageList.map((p) => {
		const match = p.match(/- \[(x| )\] `([a-z-@\/]+)`/);
		const quarantine = match[1] === "x";
		return [match[2], quarantine];
	})
);

const passRate = await fetch(
	"https://pass-rate-tracker.devprod.workers.dev/submit"
).then((r) => r.json());

console.log(
	`To quarantine a package, ensure its checkbox is checked. To unquarantine a package, ensure its checkbox is unchecked.

<!-- START-LIST -->

${Object.entries(passRate)
	.map(
		(p) =>
			`- [${quarantined[p[0]] ? "x" : " "}] \`${p[0]}\` (${Math.floor(
				(p[1].pass / (p[1].pass + p[1].fail)) * 100
			)}% pass rate on \`main\`)`
	)
	.join("\n")}

<!-- END-LIST -->`
);
