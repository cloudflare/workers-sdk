import {
	deleteCertificate,
	deleteContainerApplication,
	deleteContainerImage,
	deleteDatabase,
	deleteHyperdriveConfig,
	deleteKVNamespace,
	deleteProject,
	deleteR2Bucket,
	deleteWorker,
	listCertificates,
	listE2eContainerImages,
	listHyperdriveConfigs,
	listTmpDatabases,
	listTmpE2EContainerApplications,
	listTmpE2EProjects,
	listTmpE2EWorkers,
	listTmpKVNamespaces,
	listTmpR2Buckets,
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
	await deleteKVNamespaces();

	await deleteR2Buckets();

	await deleteProjects();

	await deleteWorkers();

	await deleteD1Databases();

	await deleteHyperdriveConfigs();

	await deleteMtlsCertificates();

	await deleteContainerApplications();

	deleteContainerImages();
}

async function deleteKVNamespaces() {
	const kvNamespacesToDelete = await listTmpKVNamespaces();
	for (const kvNamespace of kvNamespacesToDelete) {
		console.log("Deleting KV namespace: " + kvNamespace.title);
		if (await deleteKVNamespace(kvNamespace.id)) {
			console.log(`Successfully deleted KV namespace ${kvNamespace.id}`);
		} else {
			console.log(`Failed to delete KV namespace ${kvNamespace.id}`);
		}
	}

	if (kvNamespacesToDelete.length === 0) {
		console.log(`No KV namespaces to delete.`);
	}
}

async function deleteProjects() {
	const projectsToDelete = await listTmpE2EProjects();

	for (const project of projectsToDelete) {
		console.log("Deleting Pages project: " + project.name);
		if (await deleteProject(project.name)) {
			console.log(`Successfully deleted project ${project.name}`);
		} else {
			console.log(`Failed to delete project ${project.name}`);
		}
	}

	if (projectsToDelete.length === 0) {
		console.log(`No projects to delete.`);
	}
}

function deleteContainerImages() {
	const containerImagesToDelete = listE2eContainerImages();

	for (const image of containerImagesToDelete) {
		console.log("Deleting Container image: " + image.name + ":" + image.tag);
		if (deleteContainerImage(image)) {
			console.log(`Successfully deleted project ${image.name}:${image.tag}`);
		} else {
			console.log(`Failed to delete project ${image.name}:${image.tag}`);
		}
	}

	if (containerImagesToDelete.length === 0) {
		console.log(`No container image to delete.`);
	}
}

async function deleteWorkers() {
	const workersToDelete = await listTmpE2EWorkers();

	for (const worker of workersToDelete) {
		console.log("Deleting worker: " + worker.id);
		if (await deleteWorker(worker.id)) {
			console.log(`Successfully deleted Worker ${worker.id}`);
		} else {
			console.log(`Failed to delete Worker ${worker.id}`);
		}
	}

	if (workersToDelete.length === 0) {
		console.log(`No workers to delete.`);
	}
}

async function deleteD1Databases() {
	const d1DatabasesToDelete = await listTmpDatabases();

	for (const db of d1DatabasesToDelete) {
		console.log("Deleting D1 database: " + db.name);
		if (await deleteDatabase(db.uuid)) {
			console.log(`Successfully deleted D1 database ${db.uuid}`);
		} else {
			console.log(`Failed to delete D1 database ${db.uuid}`);
		}
	}
	if (d1DatabasesToDelete.length === 0) {
		console.log(`No D1 databases to delete.`);
	}
}

async function deleteHyperdriveConfigs() {
	const hyperdriveConfigsToDelete = await listHyperdriveConfigs();
	for (const config of hyperdriveConfigsToDelete) {
		console.log("Deleting Hyperdrive configs: " + config.id);

		if (await deleteHyperdriveConfig(config.id)) {
			console.log(`Successfully deleted Hyperdrive config ${config.id}`);
		} else {
			console.log(`Failed to delete Hyperdrive config ${config.id}`);
		}
	}
	if (hyperdriveConfigsToDelete.length === 0) {
		console.log(`No Hyperdrive configs to delete.`);
	}
}

async function deleteMtlsCertificates() {
	const mtlsCertificates = await listCertificates();
	for (const certificate of mtlsCertificates) {
		console.log("Deleting mTLS certificate: " + certificate.id);
		await deleteCertificate(certificate.id);
	}
	if (mtlsCertificates.length === 0) {
		console.log(`No mTLS certificates to delete.`);
	} else {
		console.log(
			`Successfully deleted ${mtlsCertificates.length} mTLS certificates`
		);
	}
}

async function deleteContainerApplications() {
	const containers = await listTmpE2EContainerApplications();
	for (const container of containers) {
		await deleteContainerApplication(container);
		console.log(`Deleted ${container.name} (${container.id})`);
	}
}

async function deleteR2Buckets() {
	const bucketsToDelete = await listTmpR2Buckets();

	for (const bucket of bucketsToDelete) {
		console.log("Deleting R2 bucket: " + bucket.name);
		if (await deleteR2Bucket(bucket.name)) {
			console.log(`Successfully deleted R2 bucket ${bucket.name}`);
		} else {
			console.log(`Failed to delete R2 bucket ${bucket.name}`);
		}
	}

	if (bucketsToDelete.length === 0) {
		console.log(`No R2 buckets to delete.`);
	}
}
