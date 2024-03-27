import type {
	D1Database,
	DurableObjectNamespace,
	Fetcher,
	KVNamespace,
	Queue,
	R2Bucket,
} from "@cloudflare/workers-types";

export type EnvByType<Env> = {
	var: EnvTypeGroup<Env, string>;
	kv: EnvTypeGroup<Env, KVNamespace>;
	service: EnvTypeGroup<Env, Fetcher>;
	r2: EnvTypeGroup<Env, R2Bucket>;
	do: EnvTypeGroup<Env, DurableObjectNamespace>;
	d1: EnvTypeGroup<Env, D1Database>;
	queue: EnvTypeGroup<Env, Queue>;
};

type EnvTypeGroup<Env, T> = {
	[K in keyof Env as Env[K] extends T ? K : never]: Env[K];
};

export function getEnvByType<Env extends Record<string, unknown>>(
	env: Env
): EnvByType<Env> {
	return {
		var: groupType(isVar) as EnvTypeGroup<Env, string>,
		kv: groupType(isKv) as EnvTypeGroup<Env, KVNamespace>,
		service: groupType(isService) as EnvTypeGroup<Env, Fetcher>,
		r2: groupType(isR2) as EnvTypeGroup<Env, R2Bucket>,
		do: groupType(isDo) as EnvTypeGroup<Env, DurableObjectNamespace>,
		d1: groupType(isD1) as EnvTypeGroup<Env, D1Database>,
		queue: groupType(isQueue) as EnvTypeGroup<Env, Queue>,
	};

	function groupType(predicate: (binding: unknown) => boolean) {
		return Object.fromEntries(
			Object.entries(env)
				.filter(([bindingName, binding]) =>
					predicate(binding) ? bindingName : null
				)
				.filter(Boolean)
		);
	}
}

function isVar(binding: unknown): boolean {
	if (typeof binding === "string") {
		return true;
	}

	// TO IMPLEMENT
	// if(isfullyserializable) return true;

	return false;
}

// NOTE: unfortunately the AI bindings is considered a service here, since
//       it is implemented using a fetcher and so it is completely
//       indistinguishable from a standard service binding
function isService(binding: unknown): boolean {
	const asRecord = binding as Record<string, unknown>;

	return [asRecord.fetch, asRecord.connect].every(
		(field) => typeof field === "function"
	);
}

function isKv(binding: unknown): boolean {
	if (!containsCrudLikeMethods(binding as Record<string, unknown>)) {
		return false;
	}
	return !containsR2Methods(binding as Record<string, unknown>);
}

function containsR2Methods(binding: Record<string, unknown>): boolean {
	return [binding.createMultipartUpload, binding.resumeMultipartUpload].every(
		(field) => typeof field === "function"
	);
}

function isR2(binding: unknown): boolean {
	if (!containsCrudLikeMethods(binding as Record<string, unknown>)) {
		return false;
	}
	return containsR2Methods(binding as Record<string, unknown>);
}

function isDo(binding: unknown): boolean {
	const asRecord = binding as Record<string, unknown>;
	return [
		asRecord.get,
		asRecord.idFromName,
		asRecord.idFromString,
		asRecord.newUniqueId,
	].every((field) => typeof field === "function");
}

function isD1(binding: unknown): boolean {
	const asRecord = binding as Record<string, unknown>;

	return [asRecord.batch, asRecord.dump, asRecord.exec, asRecord.prepare].every(
		(field) => typeof field === "function"
	);
}

function isQueue(binding: unknown): boolean {
	const asRecord = binding as Record<string, unknown>;

	return [asRecord.send, asRecord.sendBatch].every(
		(field) => typeof field === "function"
	);
}

function containsCrudLikeMethods(binding: Record<string, unknown>): boolean {
	return [binding.get, binding.put, binding.delete, binding.list].every(
		(field) => typeof field === "function"
	);
}
