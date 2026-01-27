interface Env {
	id: string;
	tag: string;
	timestamp: string;
}

interface WorkerVersionMetadata {
	readonly id: string;
	readonly tag: string;
	readonly timestamp: string;
}

class LocalWorkerVersionMetadata implements WorkerVersionMetadata {
	readonly id: string;
	readonly tag: string;
	readonly timestamp: string;

	constructor(env: Env) {
		this.id = env.id;
		this.tag = env.tag;
		this.timestamp = env.timestamp;
	}
}

export default function (env: Env): WorkerVersionMetadata {
	return new LocalWorkerVersionMetadata(env);
}
