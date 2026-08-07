import { sanitisePath } from "../../workers";
import type { EmailArtifact } from "../../workers/email/storage";

const managers = new WeakMap<AbortSignal, EmailArtifactManager>();

function getArtifactKey(artifact: EmailArtifact): string {
	return `${sanitisePath(artifact.recordId)}\0${sanitisePath(artifact.prefix)}\0${sanitisePath(artifact.id)}.${sanitisePath(artifact.extension)}`;
}

function normaliseArtifact(artifact: EmailArtifact): EmailArtifact {
	return {
		recordId: sanitisePath(artifact.recordId),
		prefix: sanitisePath(artifact.prefix),
		id: sanitisePath(artifact.id),
		extension: sanitisePath(artifact.extension),
	};
}

export function getEmailArtifactManager(
	signal: AbortSignal
): EmailArtifactManager {
	let manager = managers.get(signal);
	if (manager === undefined) {
		manager = new EmailArtifactManager();
		managers.set(signal, manager);
		signal.addEventListener(
			"abort",
			() => {
				manager?.dispose();
			},
			{ once: true }
		);
	}
	return manager;
}

export class EmailArtifactManager {
	#tombstones = new Set<string>();
	#operations = new Map<string, Promise<string | null>>();

	async store(
		artifact: EmailArtifact,
		write: () => Promise<string>
	): Promise<string | null> {
		const key = getArtifactKey(artifact);
		const previous = this.#operations.get(key);
		const operation = (previous ?? Promise.resolve(null)).then(async () => {
			if (this.#tombstones.delete(key)) {
				return null;
			}
			return await write();
		});
		this.#operations.set(key, operation);
		try {
			return await operation;
		} finally {
			if (this.#operations.get(key) === operation) {
				this.#operations.delete(key);
			}
		}
	}

	async delete(
		artifacts: EmailArtifact[],
		remove: (artifacts: EmailArtifact[]) => Promise<void>
	): Promise<void> {
		const normalisedArtifacts = artifacts.map(normaliseArtifact);
		const keys = normalisedArtifacts.map(getArtifactKey);
		for (const artifact of normalisedArtifacts) {
			this.#tombstones.add(getArtifactKey(artifact));
		}
		try {
			await Promise.all(keys.map((key) => this.#operations.get(key)));
			await remove(normalisedArtifacts);
		} finally {
			for (const key of keys) {
				this.#tombstones.delete(key);
			}
		}
	}

	dispose(): void {
		this.#tombstones.clear();
	}

	async drain(): Promise<void> {
		await Promise.allSettled(this.#operations.values());
		this.#operations.clear();
	}
}

export async function drainEmailArtifactManager(
	signal: AbortSignal
): Promise<void> {
	const manager = managers.get(signal);
	await manager?.drain();
	managers.delete(signal);
}
