import { execa } from "execa";

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.error("CLOUDFLARE_API_TOKEN must be set");
	process.exit(1);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.error("CLOUDFLARE_ACCOUNT_ID must be set");
	process.exit(1);
}

const npx = async (args) => {
	const argv = args.split(" ");
	return execa("npx", argv);
};

const listProjectsToDelete = async () => {
	const toDelete = [];

	const { stdout } = await npx("wrangler pages project list");

	for (const line of stdout.split("\n")) {
		const c3ProjectRe = /(c3-e2e-\w*)\s+│/;
		const match = line.match(c3ProjectRe);

		if (match) {
			toDelete.push(match[1]);
		}
	}

	return toDelete;
};

const deleteProjects = async (projects) => {
	for (const project of projects) {
		console.log(`Deleting project: ${project}`);
		await npx(`wrangler pages project delete -y ${project}`);
	}
};

const projects = await listProjectsToDelete();
deleteProjects(projects);
