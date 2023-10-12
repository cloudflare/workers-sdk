import { Project, deleteProject, listC3Projects } from "./common";

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.error("CLOUDFLARE_API_TOKEN must be set");
	process.exit(1);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.error("CLOUDFLARE_ACCOUNT_ID must be set");
	process.exit(1);
}

const run = async () => {
	const projectsToDelete = (await listC3Projects()) as Project[];

	for (const project of projectsToDelete) {
		await deleteProject(project.name);
	}

	if (projectsToDelete.length === 0) {
		console.log(`No projects to delete.`);
	} else {
		console.log(`Successfully deleted ${projectsToDelete.length} projects`);
	}
};

run();
