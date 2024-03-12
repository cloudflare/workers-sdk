import { deepFreeze } from "../utils";

export type BindingNames = Record<
	"var" | "service" | "kv" | "do" | "d1" | "r2" | "queue",
	string[]
>;

export function getBindingNames(
	env: Record<string, unknown>
): Readonly<BindingNames> {
	const names: BindingNames = {
		var: [],
		service: [],
		kv: [],
		do: [],
		d1: [],
		r2: [],
		queue: [],
	};

	Object.entries(env).forEach(([name, binding]) => {
		if (isVar(binding)) {
			return names.var.push(name);
		}
		if (isService(binding)) {
			return names.service.push(name);
		}
		if (isKv(binding)) {
			return names.kv.push(name);
		}
		if (isDo(binding)) {
			return names.do.push(name);
		}
		if (isR2(binding)) {
			return names.r2.push(name);
		}
		if (isD1(binding)) {
			return names.d1.push(name);
		}
		if (isQueue(binding)) {
			return names.queue.push(name);
		}
	});

	deepFreeze(names);
	return names;
}

function isVar(binding: unknown): boolean {
	if (typeof binding === "string") {
		return true;
	}

  // TO IMPLEMENT
	// if(isfullyserializable) return true;

	return false;
}

function containsCrudLikeMethods(binding: Record<string, unknown>): boolean {
	return [binding.get, binding.put, binding.delete, binding.list].every(
		(field) => typeof field === "function"
	);
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
