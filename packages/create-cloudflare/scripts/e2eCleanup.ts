import {
	Project,
	deleteProject,
	deleteWorker,
	listC3Projects,
	listC3Workers,
} from "./common";

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.error("CLOUDFLARE_API_TOKEN must be set");
	process.exit(1);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.error("CLOUDFLARE_ACCOUNT_ID must be set");
	process.exit(1);
}

const run = async () => {
	const projectsToDelete = await listC3Projects();

	for (const project of projectsToDelete) {
		console.log("Deleting Pages project: " + project.name);
		await deleteProject(project.name);
	}

	if (projectsToDelete.length === 0) {
		console.log(`No projects to delete.`);
	} else {
		console.log(`Successfully deleted ${projectsToDelete.length} projects`);
	}

	const workersToDelete = await listC3Workers();

	for (const worker of workersToDelete) {
		console.log("Deleting worker: " + worker.id);
		await deleteWorker(worker.id);
	}

	if (workersToDelete.length === 0) {
		console.log(`No workers to delete.`);
	} else {
		console.log(`Successfully deleted ${workersToDelete.length} workers`);
	}
};

run();
