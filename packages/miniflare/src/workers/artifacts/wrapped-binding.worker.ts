/**
 * Wrapped binding for a local Artifacts namespace. It runs in the caller's
 * isolate, so an `ArtifactsError` is thrown there and never crosses an RPC
 * boundary, where workerd would log it as an uncaught exception.
 */
import type { LocalArtifactsNamespace, Outcome } from "./binding.worker";

interface Env {
	namespace: Pick<
		LocalArtifactsNamespace,
		"create" | "get" | "import" | "list" | "delete"
	>;
}

type Unwrapped<F> = F extends (...args: infer A) => Promise<Outcome<infer T>>
	? (...args: A) => Promise<T>
	: never;

type RepoHandle = Extract<
	Awaited<ReturnType<LocalArtifactsNamespace["get"]>>,
	{ ok: true }
>["value"];

type Repo = { [K in keyof RepoHandle]: Unwrapped<RepoHandle[K]> } & Disposable;

type Failure = Extract<Outcome<unknown>, { ok: false }>["error"];

/** The namespace service owns the codes; this only rethrows its failure. */
class ArtifactsError extends Error {
	readonly code: Failure["code"];
	readonly numericCode: number;

	constructor({ code, numericCode, message }: Failure) {
		super(message);
		this.name = "ArtifactsError";
		this.code = code;
		this.numericCode = numericCode;
	}
}

function unwrap<T>(result: Outcome<T>): T {
	if (result.ok) {
		return result.value;
	}
	throw new ArtifactsError(result.error);
}

function wrapRepo(handle: RepoHandle, dispose: (() => void) | undefined): Repo {
	// A plain object keeps the methods enumerable, like the RPC stub it replaces.
	return {
		info: async () => unwrap(await handle.info()),
		createToken: async (scope, ttl) =>
			unwrap(await handle.createToken(scope, ttl)),
		listTokens: async () => unwrap(await handle.listTokens()),
		revokeToken: async (tokenOrId) =>
			unwrap(await handle.revokeToken(tokenOrId)),
		readBlob: async (hash) => unwrap(await handle.readBlob(hash)),
		readTree: async (hash) => unwrap(await handle.readTree(hash)),
		readCommit: async (hash) => unwrap(await handle.readCommit(hash)),
		readFile: async (args) => unwrap(await handle.readFile(args)),
		log: async (options) => unwrap(await handle.log(options)),
		fork: async (name, options) => unwrap(await handle.fork(name, options)),
		[Symbol.dispose]() {
			dispose?.();
		},
	};
}

export default function (env: Env) {
	const { namespace } = env;
	return {
		create: async (...args: Parameters<LocalArtifactsNamespace["create"]>) =>
			unwrap(await namespace.create(...args)),
		get: async (name: string) => {
			const result = (await namespace.get(name)) as Outcome<RepoHandle> &
				Partial<Disposable>;
			const handle = unwrap(result);
			return wrapRepo(handle, () => result[Symbol.dispose]?.());
		},
		import: async (...args: Parameters<LocalArtifactsNamespace["import"]>) =>
			unwrap(await namespace.import(...args)),
		list: async (...args: Parameters<LocalArtifactsNamespace["list"]>) =>
			unwrap(await namespace.list(...args)),
		delete: async (name: string) => unwrap(await namespace.delete(name)),
	};
}
