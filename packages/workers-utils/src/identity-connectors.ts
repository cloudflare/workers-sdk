import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	isConnectionBinding,
	type ConnectionBindingConfig,
	type ConnectionOAuthConfig,
	type ConnectionPermissions,
} from "./config/connections";

/** Account/realm-scoped private platform operations; no public API/IAM contract. */
export interface IdentityConnectorClient {
	get(id: string, revision: number): Promise<IdentityConnectorResource>;
	operation(id: string): Promise<IdentityConnectorResource | undefined>;
	create(
		operationId: string,
		oauth: ConnectionOAuthConfig
	): Promise<IdentityConnectorResource>;
	reconcile(
		id: string,
		revision: number,
		oauth: ConnectionOAuthConfig
	): Promise<IdentityConnectorResource>;
}
export interface IdentityConnectorResource {
	id: string;
	revision: number;
	permissions: ConnectionPermissions;
}
export interface IdentityConnectorProgress {
	operationId: string;
	definitionDigest: string;
	connectorId?: string;
	connectorRevision?: number;
}
/** Durable infrastructure state. Persist this with the deployment's retained inputs. */
export interface IdentityConnectorState {
	version: 1;
	accountId: string;
	realm: string;
	resources: Record<string, IdentityConnectorProgress>;
}
export interface IdentityConnectorStateStore {
	read(): Promise<IdentityConnectorState | undefined>;
	write(state: IdentityConnectorState): Promise<void>;
}
function canonical(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonical).join(",")}]`;
	}
	if (typeof value === "object" && value !== null) {
		return `{${Object.entries(value)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
function digest(oauth: ConnectionOAuthConfig) {
	return createHash("sha256").update(canonical(oauth)).digest("hex");
}
function validRecord(record: IdentityConnectorResource) {
	if (
		!isConnectionBinding({
			binding: "CHECK",
			connector_id: record.id,
			connector_revision: record.revision,
			...record.permissions,
		})
	) {
		throw new Error("Invalid private connector response.");
	}
}
function validateAttachment(
	binding: ConnectionBindingConfig,
	record: IdentityConnectorResource
) {
	validRecord(record);
	// Reuse the inline subset validator without executing setup or editing a connector.
	if (
		!isConnectionBinding({
			...binding,
			connector_id: record.id,
			connector_revision: record.revision,
			oauth: {
				grant: "authorization_code",
				authorization_server: "https://validation.invalid",
				resource: "https://resource.invalid",
				authorization_endpoint: "https://validation.invalid/authorize",
				token_endpoint: "https://validation.invalid/token",
				client_registration: {
					mode: "existing",
					authentication: "none",
					client_id: "validation-only",
				},
				permission_ceiling: record.permissions,
			},
		})
	) {
		throw new Error(
			"Identity attachment exceeds the account connector's permissions."
		);
	}
}
export type IdentityConnectorPlan = {
	action: "attach" | "create" | "reconcile";
	binding: string;
	connectorId?: string;
	connectorRevision?: number;
};
/** Reusable apply/recovery logic for normal deployment tools. Never creates tokens or consent. */
export class IdentityConnectorProvisioning {
	constructor(
		private readonly options: {
			accountId: string;
			realm: string;
			client: IdentityConnectorClient;
			store: IdentityConnectorStateStore;
		}
	) {}
	async apply(
		binding: ConnectionBindingConfig,
		resourceKey: string,
		dryRun = false
	): Promise<{
		plan: IdentityConnectorPlan;
		binding: ConnectionBindingConfig;
	}> {
		if (
			!isConnectionBinding(binding) ||
			!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(resourceKey) ||
			["constructor", "prototype"].includes(resourceKey)
		) {
			throw new Error("Invalid identity connector configuration.");
		}
		const state = (await this.options.store.read()) ?? {
			version: 1,
			accountId: this.options.accountId,
			realm: this.options.realm,
			resources: {},
		};
		if (
			state.version !== 1 ||
			state.accountId !== this.options.accountId ||
			state.realm !== this.options.realm
		) {
			throw new Error(
				"Retained identity connector state belongs to another account or realm."
			);
		}
		const retained = state.resources[resourceKey];
		const connectorId = binding.connector_id ?? retained?.connectorId;
		const revision = binding.connector_revision ?? retained?.connectorRevision;
		const plan: IdentityConnectorPlan = {
			action: binding.oauth ? (connectorId ? "reconcile" : "create") : "attach",
			binding: binding.binding,
			...(connectorId ? { connectorId } : {}),
			...(revision ? { connectorRevision: revision } : {}),
		};
		// Planning does not create even a local operation record and does not invoke a platform method.
		if (dryRun) {
			return { plan, binding };
		}
		let record: IdentityConnectorResource;
		if (!binding.oauth) {
			if (!connectorId || !revision) {
				throw new Error(
					"ID-only attachment requires retained connector ID and revision."
				);
			}
			record = await this.options.client.get(connectorId, revision);
			if (record.id !== connectorId || record.revision !== revision) {
				throw new Error(
					"Requested identity connector revision is unavailable."
				);
			}
		} else if (connectorId) {
			if (!revision) {
				throw new Error("Reconcile requires an expected connector revision.");
			}
			// Explicit IDs, including deleted/unknown IDs, never become creates.
			record = await this.options.client.reconcile(
				connectorId,
				revision,
				binding.oauth
			);
			if (record.id !== connectorId) {
				throw new Error(
					"Private connector reconcile changed resource identity."
				);
			}
		} else {
			const definitionDigest = digest(binding.oauth);
			if (retained && retained.definitionDigest !== definitionDigest) {
				throw new Error(
					"Unresolved connector create has different input. Recover it before changing setup."
				);
			}
			const progress: IdentityConnectorProgress = retained ?? {
				operationId: randomUUID(),
				definitionDigest,
			};
			state.resources[resourceKey] = progress;
			await this.options.store.write(state); // Intent survives a lost create response or a later failed upload.
			record =
				(await this.options.client.operation(progress.operationId)) ??
				(await this.options.client.create(progress.operationId, binding.oauth));
		}
		validateAttachment(binding, record);
		state.resources[resourceKey] = {
			operationId: state.resources[resourceKey]?.operationId ?? randomUUID(),
			definitionDigest: binding.oauth
				? digest(binding.oauth)
				: (retained?.definitionDigest ?? "attached"),
			connectorId: record.id,
			connectorRevision: record.revision,
		};
		await this.options.store.write(state); // Persist before returning control to the Worker deployment.
		return {
			plan,
			binding: {
				...binding,
				connector_id: record.id,
				connector_revision: record.revision,
			},
		};
	}
}

/** Atomic, credential-free state that can be retained with infrastructure configuration. */
export class IdentityConnectorFileStateStore implements IdentityConnectorStateStore {
	constructor(private readonly file: string) {}
	async read(): Promise<IdentityConnectorState | undefined> {
		let contents: string;
		try {
			contents = await fs.readFile(this.file, "utf8");
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return undefined;
			}
			throw error;
		}
		if (contents.length > 1048576) {
			throw new Error(
				"Retained identity connector state exceeds its size limit."
			);
		}
		const value: unknown = JSON.parse(contents);
		if (
			typeof value !== "object" ||
			value === null ||
			!("version" in value) ||
			value.version !== 1 ||
			!("accountId" in value) ||
			typeof value.accountId !== "string" ||
			!("realm" in value) ||
			typeof value.realm !== "string" ||
			!("resources" in value) ||
			typeof value.resources !== "object" ||
			value.resources === null ||
			Array.isArray(value.resources)
		) {
			throw new Error("Unsupported retained identity connector state.");
		}
		for (const entry of Object.values(value.resources)) {
			if (
				typeof entry !== "object" ||
				entry === null ||
				!("operationId" in entry) ||
				typeof entry.operationId !== "string" ||
				!("definitionDigest" in entry) ||
				typeof entry.definitionDigest !== "string"
			) {
				throw new Error("Invalid retained identity connector operation.");
			}
		}
		return value as IdentityConnectorState;
	}
	async write(state: IdentityConnectorState): Promise<void> {
		await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
		const temporary = `${this.file}.${randomUUID()}.tmp`;
		const handle = await fs.open(temporary, "wx", 0o600);
		try {
			await handle.writeFile(JSON.stringify(state, null, 2) + "\n");
			await handle.sync();
		} finally {
			await handle.close();
		}
		try {
			await fs.rename(temporary, this.file);
			if (process.platform !== "win32") {
				const directory = await fs.open(path.dirname(this.file), "r");
				try {
					await directory.sync();
				} finally {
					await directory.close();
				}
			}
		} finally {
			await fs.rm(temporary, { force: true });
		}
	}
}
/** Prevent competing local applies from assigning different operation IDs to one resource. */
export async function withIdentityConnectorState<T>(
	file: string,
	work: (store: IdentityConnectorStateStore) => Promise<T>
): Promise<T> {
	await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
	const lock = `${file}.lock`;
	let handle;
	try {
		handle = await fs.open(lock, "wx", 0o600);
	} catch {
		throw new Error(
			"Identity connector apply is already locked. Wait for the active apply; after a crashed process, remove its .lock file before retrying. Keep the state file."
		);
	}
	try {
		await handle.writeFile(String(process.pid));
		return await work(new IdentityConnectorFileStateStore(file));
	} finally {
		await handle.close();
		await fs.rm(lock, { force: true });
	}
}
