import {
	deleteDatabase,
	deleteKVNamespace,
	deleteProject,
	deleteWorker,
	listTmpDatabases,
	listTmpE2EProjects,
	listTmpE2EWorkers,
	listTmpKVNamespaces,
} from "./common";

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.error("CLOUDFLARE_API_TOKEN must be set");
	process.exit(1);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.error("CLOUDFLARE_ACCOUNT_ID must be set");
	process.exit(1);
}

run().catch((e) => {
	if ("code" in e) {
		process.exit(e.code);
	}
});

async function run() {
	const projectsToDelete = await listTmpE2EProjects();

	for (const project of projectsToDelete) {
		console.log("Deleting Pages project: " + project.name);
		await deleteProject(project.name);
	}

	if (projectsToDelete.length === 0) {
		console.log(`No projects to delete.`);
	} else {
		console.log(`Successfully deleted ${projectsToDelete.length} projects`);
	}

	const workersToDelete = await listTmpE2EWorkers();

	for (const worker of workersToDelete) {
		console.log("Deleting worker: " + worker.id);
		await deleteWorker(worker.id);
	}

	if (workersToDelete.length === 0) {
		console.log(`No workers to delete.`);
	} else {
		console.log(`Successfully deleted ${workersToDelete.length} workers`);
	}

	const kvNamespacesToDelete = await listTmpKVNamespaces();
	for (const kvNamespace of kvNamespacesToDelete) {
		console.log("Deleting KV namespace: " + kvNamespace.title);
		await deleteKVNamespace(kvNamespace.id);
	}

	if (kvNamespacesToDelete.length === 0) {
		console.log(`No KV namespaces to delete.`);
	} else {
		console.log(
			`Successfully deleted ${kvNamespacesToDelete.length} KV namespaces`
		);
	}

	const d1DatabasesToDelete = await listTmpDatabases();
	for (const db of d1DatabasesToDelete) {
		console.log("Deleting D1 database: " + db.name);
		await deleteDatabase(db.name);
	}
	if (d1DatabasesToDelete.length === 0) {
		console.log(`No D1 databases to delete.`);
	} else {
		console.log(
			`Successfully deleted ${d1DatabasesToDelete.length} D1 databases`
		);
	}
}
