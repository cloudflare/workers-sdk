import { deployC3E2EWorkers } from "./deploy-c3-e2e";

if (require.main === module) {
	deployC3E2EWorkers().catch((error) => {
		console.error("Failed to deploy C3 E2E workers:", error);
		process.exit(1);
	});
}
