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
				managers.delete(signal);
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
		await Promise.all(
			normalisedArtifacts.map((artifact) =>
				this.#operations.get(getArtifactKey(artifact))
			)
		);
		for (const artifact of normalisedArtifacts) {
			this.#tombstones.add(getArtifactKey(artifact));
		}
		await remove(normalisedArtifacts);
	}

	dispose(): void {
		this.#operations.clear();
		this.#tombstones.clear();
	}
}
