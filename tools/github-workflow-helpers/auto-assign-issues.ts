import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import dedent from "ts-dedent";
import type { IssuesLabeledEvent } from "@octokit/webhooks-types";

/**
 * The mapping of github issue labels to team members for assignment.
 */
const TEAM_ASSIGNMENTS: { [label: string]: { [jobRole: string]: string } } = {
	agents: { em: "whoiskatrin", pm: "mikenomitch" },
	"analytics engine": {},
	api: { em: "dcartertwo", pm: "korinne" },
	auth: { em: "dcartertwo", pm: "korinne" },
	"auto-provisioning": { em: "lrapoport-cf", pm: "mattietk" },
	c3: { em: "lrapoport-cf", pm: "mattietk" },
	constellation: {},
	containers: { em: "th0m", pm: "mikenomitch" },
	d1: { em: "joshthoward", pm: "vy-ton" },
	documentation: {},
	"durable objects": { em: "joshthoward", pm: "vy-ton" },
	hyperdrive: { em: "sejoker", pm: "thomasgauvin" },
	"kv-asset-handler": { em: "lrapoport-cf", pm: "mattietk" },
	miniflare: { em: "lrapoport-cf", pm: "mattietk" },
	multiworker: { em: "lrapoport-cf", pm: "mattietk" },
	"node compat": { em: "lrapoport-cf", pm: "mattietk" },
	"nodejs compat": { em: "lrapoport-cf", pm: "mattietk" },
	observability: { em: "boristane", pm: "nevikashah" },
	opennext: { em: "lrapoport-cf", pm: "mattietk", tl: "vicb" },
	pages: { em: "dcartertwo", pm: "irvinebroque" },
	pipelines: {},
	"playground-worker": { em: "lrapoport-cf", pm: "mattietk" },
	python: { em: "danlapid", pm: "mikenomitch" },
	queues: {},
	r2: { em: "annibread", pm: "aninibread" },
	"remote-bindings": { em: "lrapoport-cf", pm: "mattietk" },
	"secrets-store": {},
	"start-dev-worker": { em: "lrapoport-cf", pm: "mattietk" },
	templates: { em: "lrapoport-cf", pm: "mattietk" },
	types: { em: "lrapoport-cf", pm: "mattietk" },
	"types-ai": { em: "jkipp-cloudflare" },
	unenv: { em: "lrapoport-cf", pm: "mattietk" },
	unstable_dev: { em: "lrapoport-cf", pm: "mattietk" },
	vectorize: { em: "sejoker", pm: "jonesphillip" },
	"vite-plugin": { em: "lrapoport-cf", pm: "mattietk" },
	vitest: { em: "lrapoport-cf", pm: "mattietk" },
	"workers vpc": { em: "efalcao", pm: "thomasgauvin" },
	"Workers + Assets": { em: "dcartertwo", pm: "irvinebroque" },
	"workers ai": { em: "jkipp-cloudflare" },
	"workers-builds": {
		director: "dcartertwo",
		pm: "yomna-shousha",
		em: "robertsapunarich",
	},
	workflows: { em: "bruxodasilva", pm: "jonesphillip" },
	wrangler: { em: "lrapoport-cf", pm: "mattietk" },
};

if (require.main === module) {
	run().catch((error) => {
		core.setFailed(error);
	});
}

async function run() {
	core.info(dedent`
			Auto Assign Issues
			==================
			`);

	if (isIssuesLabeledEvent(context.payload)) {
		const {
			issue,
			label: { name: labelName },
		} = context.payload;

		core.info(`Processing new label: ${labelName} for issue #${issue.number}`);

		const teamConfig = TEAM_ASSIGNMENTS[labelName];
		if (!teamConfig) {
			core.info(`No team assignment found for label: ${labelName}`);
			return;
		}

		const teamAssignees = new Set(Object.values(teamConfig));
		const currentAssignees = new Set(issue.assignees?.map((a) => a.login));
		const toBeAssigned = teamAssignees.difference(currentAssignees);

		if (toBeAssigned.size === 0) {
			core.info(
				`All potential assignees are already assigned to issue. Skipping auto-assignment.`
			);
			return;
		}

		core.info(
			`Assigning to: ${new Intl.ListFormat("en").format(toBeAssigned)}`
		);

		const token = core.getInput("github_token", { required: true });
		const octokit = getOctokit(token);
		const result = await octokit.rest.issues.addAssignees({
			owner: context.repo.owner,
			repo: context.repo.repo,
			issue_number: issue.number,
			assignees: Array.from(toBeAssigned),
		});

		const assigned = new Set(result.data.assignees?.map((a) => a.login));
		const missing = toBeAssigned.difference(assigned);

		if (missing.size > 0) {
			core.warning(
				dedent`
          Not all assignees were added to the issue. They may not be collaborators on the repository.
          Missing assignees: ${new Intl.ListFormat("en").format(missing)}
        `
			);
		}

		core.info(
			`Issue assigned to ${new Intl.ListFormat("en").format(assigned)}`
		);
	}
}

/**
 * Type guard to check if the payload is an IssuesLabeledEvent.
 */
function isIssuesLabeledEvent(
	payload: object
): payload is Required<IssuesLabeledEvent> {
	return (
		payload &&
		"action" in payload &&
		payload.action === "labeled" &&
		"issue" in payload &&
		!!payload.issue &&
		"label" in payload &&
		!!payload.label
	);
}
