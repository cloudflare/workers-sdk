// ../../../../../../../../.npm/_npx/d6768b39ab4bfa9b/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
	__facade_middleware__.push(...args.flat());
}
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
	const [head, ...tail] = middlewareChain;
	const middlewareCtx = {
		dispatch,
		next(newRequest, newEnv) {
			return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
		},
	};
	return head(request, env, ctx, middlewareCtx);
}
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
	return __facade_invokeChain__(request, env, ctx, dispatch, [
		...__facade_middleware__,
		finalMiddleware,
	]);
}

// worker.mjs
async function requestJson(request) {
	const text = await request.text();
	return JSON.parse(text, (key, value) => {
		if (typeof value === "object" && value !== null && "$type" in value) {
			if (value.$type === "Uint8Array") {
				return new Uint8Array(value.contents);
			}
		}
		return value;
	});
}
function reduceError(e) {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
		cause: e?.cause === void 0 ? void 0 : reduceError(e.cause),
	};
}
function prepareStatement(db, rawStmt) {
	let stmt = db.prepare(rawStmt.sql);
	if (rawStmt.params !== void 0) stmt = stmt.bind(...rawStmt.params);
	return stmt;
}
async function prepareStatementFromRequest(db, request) {
	const stmt = await requestJson(request);
	return prepareStatement(db, stmt);
}
var worker = {
	async fetch(request, env) {
		try {
			const { pathname } = new URL(request.url);
			if (pathname.startsWith("/prepare/first")) {
				let colName = pathname.substring("/prepare/first/".length);
				if (colName === "") colName = void 0;
				const stmt = await prepareStatementFromRequest(env.DB, request);
				return Response.json(await stmt.first(colName));
			} else if (pathname === "/prepare/run") {
				const stmt = await prepareStatementFromRequest(env.DB, request);
				return Response.json(await stmt.run());
			} else if (pathname === "/prepare/all") {
				const stmt = await prepareStatementFromRequest(env.DB, request);
				return Response.json(await stmt.all());
			} else if (pathname === "/prepare/raw") {
				const stmt = await prepareStatementFromRequest(env.DB, request);
				return Response.json(await stmt.raw());
			} else if (pathname === "/dump") {
				const buffer = await env.DB.dump();
				return new Response(buffer);
			} else if (pathname === "/batch") {
				const rawStmts = await requestJson(request);
				const stmts = rawStmts.map((stmt) => prepareStatement(env.DB, stmt));
				return Response.json(await env.DB.batch(stmts));
			} else if (pathname === "/exec") {
				const stmts = await request.text();
				return Response.json(await env.DB.exec(stmts));
			}
		} catch (e) {
			const error = reduceError(e);
			return Response.json(error, {
				status: 500,
				headers: { "MF-Experimental-Error-Stack": "true" },
			});
		}
	},
};
var worker_default = worker;

// wrangler-config:config:middleware/d1-beta
var D1_IMPORTS = ["__D1_BETA__DB"];

// ../../../../../../../../.npm/_npx/d6768b39ab4bfa9b/node_modules/wrangler/templates/middleware/middleware-d1-beta.ts
var D1Database = class {
	constructor(binding) {
		this.binding = binding;
	}
	prepare(query) {
		return new D1PreparedStatement(this, query);
	}
	async dump() {
		const response = await this.binding.fetch("http://d1/dump", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
		});
		if (response.status !== 200) {
			try {
				const err = await response.json();
				throw new Error(`D1_DUMP_ERROR: ${err.error}`, {
					cause: new Error(err.error),
				});
			} catch (e) {
				throw new Error(`D1_DUMP_ERROR: Status + ${response.status}`, {
					cause: new Error("Status " + response.status),
				});
			}
		}
		return await response.arrayBuffer();
	}
	async batch(statements) {
		const exec = await this._send(
			"/query",
			statements.map((s) => s.statement),
			statements.map((s) => s.params)
		);
		return exec;
	}
	async exec(query) {
		const lines = query.trim().split("\n");
		const _exec = await this._send("/query", lines, [], false);
		const exec = Array.isArray(_exec) ? _exec : [_exec];
		const error = exec
			.map((r) => {
				return r.error ? 1 : 0;
			})
			.indexOf(1);
		if (error !== -1) {
			throw new Error(
				`D1_EXEC_ERROR: Error in line ${error + 1}: ${lines[error]}: ${
					exec[error].error
				}`,
				{
					cause: new Error(
						"Error in line " +
							(error + 1) +
							": " +
							lines[error] +
							": " +
							exec[error].error
					),
				}
			);
		} else {
			return {
				count: exec.length,
				duration: exec.reduce((p, c) => {
					return p + c.meta.duration;
				}, 0),
			};
		}
	}
	async _send(endpoint, query, params, dothrow = true) {
		const body = JSON.stringify(
			typeof query == "object"
				? query.map((s, index) => {
						return { sql: s, params: params[index] };
					})
				: {
						sql: query,
						params,
					}
		);
		const response = await this.binding.fetch(new URL(endpoint, "http://d1"), {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body,
		});
		try {
			const answer = await response.json();
			if (answer.error && dothrow) {
				const err = answer;
				throw new Error(`D1_ERROR: ${err.error}`, {
					cause: new Error(err.error),
				});
			} else {
				return Array.isArray(answer)
					? answer.map((r) => mapD1Result(r))
					: mapD1Result(answer);
			}
		} catch (e) {
			const error = e;
			throw new Error(`D1_ERROR: ${error.cause || "Something went wrong"}`, {
				cause: new Error(`${error.cause}` || "Something went wrong"),
			});
		}
	}
};
var D1PreparedStatement = class {
	constructor(database, statement, params = []) {
		this.database = database;
		this.statement = statement;
		this.params = params;
	}
	bind(...values) {
		for (var r in values) {
			const value = values[r];
			switch (typeof value) {
				case "number":
				case "string":
					break;
				case "object":
					if (value == null) break;
					if (
						Array.isArray(value) &&
						value
							.map((b) => {
								return typeof b == "number" && b >= 0 && b < 256 ? 1 : 0;
							})
							.indexOf(0) == -1
					)
						break;
					if (value instanceof ArrayBuffer) {
						values[r] = Array.from(new Uint8Array(value));
						break;
					}
					if (ArrayBuffer.isView(value)) {
						values[r] = Array.from(new Uint8Array(value.buffer));
						break;
					}
				default:
					throw new Error(
						`D1_TYPE_ERROR: Type '${typeof value}' not supported for value '${value}'`,
						{
							cause: new Error(
								`Type '${typeof value}' not supported for value '${value}'`
							),
						}
					);
			}
		}
		return new D1PreparedStatement(this.database, this.statement, values);
	}
	async first(colName) {
		const info = firstIfArray(
			await this.database._send("/query", this.statement, this.params)
		);
		const results = info.results;
		if (colName !== void 0) {
			if (results.length > 0 && results[0][colName] === void 0) {
				throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${colName})`, {
					cause: new Error("Column not found"),
				});
			}
			return results.length < 1 ? null : results[0][colName];
		} else {
			return results.length < 1 ? null : results[0];
		}
	}
	async run() {
		return firstIfArray(
			await this.database._send("/execute", this.statement, this.params)
		);
	}
	async all() {
		return firstIfArray(
			await this.database._send("/query", this.statement, this.params)
		);
	}
	async raw() {
		const s = firstIfArray(
			await this.database._send("/query", this.statement, this.params)
		);
		const raw = [];
		for (var r in s.results) {
			const entry = Object.keys(s.results[r]).map((k) => {
				return s.results[r][k];
			});
			raw.push(entry);
		}
		return raw;
	}
};
function firstIfArray(results) {
	return Array.isArray(results) ? results[0] : results;
}
function mapD1Result(result) {
	let map = {
		results: result.results || [],
		success: result.success === void 0 ? true : result.success,
		meta: result.meta || {},
	};
	result.error && (map.error = result.error);
	return map;
}
var D1_BETA_PREFIX = `__D1_BETA__`;
var envMap = /* @__PURE__ */ new Map();
function getMaskedEnv(env) {
	if (envMap.has(env)) return envMap.get(env);
	const newEnv = new Map(Object.entries(env));
	D1_IMPORTS.filter((bindingName) =>
		bindingName.startsWith(D1_BETA_PREFIX)
	).forEach((bindingName) => {
		newEnv.delete(bindingName);
		const newName = bindingName.slice(D1_BETA_PREFIX.length);
		const newBinding = new D1Database(env[bindingName]);
		newEnv.set(newName, newBinding);
	});
	const newEnvObj = Object.fromEntries(newEnv.entries());
	envMap.set(env, newEnvObj);
	return newEnvObj;
}
function wrap(env) {
	return getMaskedEnv(env);
}

// ../../../../../../../../../../private/var/folders/xn/jl0lmfkx5gd06w3_bl12w1l00000gp/T/tmp-33052-rnZHsh2hk8Bc/middleware-insertion-facade.js
var envWrappers = [wrap].filter(Boolean);
var facade = {
	...worker_default,
	envWrappers,
	middleware: [
		void 0,
		...(worker_default.middleware ? worker_default.middleware : []),
	].filter(Boolean),
};
var middleware_insertion_facade_default = facade;

// ../../../../../../../../../../private/var/folders/xn/jl0lmfkx5gd06w3_bl12w1l00000gp/T/tmp-33052-rnZHsh2hk8Bc/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
	constructor(scheduledTime, cron, noRetry) {
		this.scheduledTime = scheduledTime;
		this.cron = cron;
		this.#noRetry = noRetry;
	}
	#noRetry;
	noRetry() {
		if (!(this instanceof __Facade_ScheduledController__)) {
			throw new TypeError("Illegal invocation");
		}
		this.#noRetry();
	}
};
var __facade_modules_fetch__ = function (request, env, ctx) {
	if (middleware_insertion_facade_default.fetch === void 0)
		throw new Error("Handler does not export a fetch() function.");
	return middleware_insertion_facade_default.fetch(request, env, ctx);
};
function getMaskedEnv2(rawEnv) {
	let env = rawEnv;
	if (
		middleware_insertion_facade_default.envWrappers &&
		middleware_insertion_facade_default.envWrappers.length > 0
	) {
		for (const wrapFn of middleware_insertion_facade_default.envWrappers) {
			env = wrapFn(env);
		}
	}
	return env;
}
var registeredMiddleware = false;
var facade2 = {
	...(middleware_insertion_facade_default.tail && {
		tail: maskHandlerEnv(middleware_insertion_facade_default.tail),
	}),
	...(middleware_insertion_facade_default.trace && {
		trace: maskHandlerEnv(middleware_insertion_facade_default.trace),
	}),
	...(middleware_insertion_facade_default.scheduled && {
		scheduled: maskHandlerEnv(middleware_insertion_facade_default.scheduled),
	}),
	...(middleware_insertion_facade_default.queue && {
		queue: maskHandlerEnv(middleware_insertion_facade_default.queue),
	}),
	...(middleware_insertion_facade_default.test && {
		test: maskHandlerEnv(middleware_insertion_facade_default.test),
	}),
	fetch(request, rawEnv, ctx) {
		const env = getMaskedEnv2(rawEnv);
		if (
			middleware_insertion_facade_default.middleware &&
			middleware_insertion_facade_default.middleware.length > 0
		) {
			if (!registeredMiddleware) {
				registeredMiddleware = true;
				for (const middleware of middleware_insertion_facade_default.middleware) {
					__facade_register__(middleware);
				}
			}
			const __facade_modules_dispatch__ = function (type, init) {
				if (
					type === "scheduled" &&
					middleware_insertion_facade_default.scheduled !== void 0
				) {
					const controller = new __Facade_ScheduledController__(
						Date.now(),
						init.cron ?? "",
						() => {}
					);
					return middleware_insertion_facade_default.scheduled(
						controller,
						env,
						ctx
					);
				}
			};
			return __facade_invoke__(
				request,
				env,
				ctx,
				__facade_modules_dispatch__,
				__facade_modules_fetch__
			);
		} else {
			return __facade_modules_fetch__(request, env, ctx);
		}
	},
};
function maskHandlerEnv(handler) {
	return (data, env, ctx) => handler(data, getMaskedEnv2(env), ctx);
}
var middleware_loader_entry_default = facade2;
export { middleware_loader_entry_default as default };
//# sourceMappingURL=worker.js.map
