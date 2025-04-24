import {
	deleteDatabase,
	deleteHyperdriveConfig,
	deleteKVNamespace,
	deleteProject,
	deleteWorker,
	listHyperdriveConfigs,
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
	// KV namespaces don't have a creation timestamp, but deletion will fail if there is a worker bound to it
	// so delete these first to avoid interrupting running e2e jobs (unless you are very very unlucky)
	const kvNamespacesToDelete = await listTmpKVNamespaces();
	for (const kvNamespace of kvNamespacesToDelete) {
		console.log("Deleting KV namespace: " + kvNamespace.title);
		(await deleteKVNamespace(kvNamespace.id))
			? console.log(`Successfully deleted KV namespace ${kvNamespace.id}`)
			: console.log(`Failed to delete KV namespace ${kvNamespace.id}`);
	}

	if (kvNamespacesToDelete.length === 0) {
		console.log(`No KV namespaces to delete.`);
	}

	const projectsToDelete = await listTmpE2EProjects();

	for (const project of projectsToDelete) {
		console.log("Deleting Pages project: " + project.name);
		(await deleteProject(project.name))
			? console.log(`Successfully deleted project ${project.name}`)
			: console.log(`Failed to delete project ${project.name}`);
	}

	if (projectsToDelete.length === 0) {
		console.log(`No projects to delete.`);
	}

	const workersToDelete = await listTmpE2EWorkers();

	for (const worker of workersToDelete) {
		console.log("Deleting worker: " + worker.id);
		(await deleteWorker(worker.id))
			? console.log(`Successfully deleted Worker ${worker.id}`)
			: console.log(`Failed to delete Worker ${worker.id}`);
	}

	if (workersToDelete.length === 0) {
		console.log(`No workers to delete.`);
	}

	const d1DatabasesToDelete = await listTmpDatabases();
	for (const db of d1DatabasesToDelete) {
		console.log("Deleting D1 database: " + db.name);
		(await deleteDatabase(db.uuid))
			? console.log(`Successfully deleted D1 database ${db.uuid}`)
			: console.log(`Failed to delete D1 database ${db.uuid}`);
	}
	if (d1DatabasesToDelete.length === 0) {
		console.log(`No D1 databases to delete.`);
	}

	const hyperdriveConfigsToDelete = await listHyperdriveConfigs();
	for (const config of hyperdriveConfigsToDelete) {
		console.log("Deleting Hyperdrive configs: " + config.id);

		(await deleteHyperdriveConfig(config.id))
			? console.log(`Successfully deleted Hyperdrive config ${config.id}`)
			: console.log(`Failed to delete Hyperdrive config ${config.id}`);
	}
	if (hyperdriveConfigsToDelete.length === 0) {
		console.log(`No Hyperdrive configs to delete.`);
	}
}
