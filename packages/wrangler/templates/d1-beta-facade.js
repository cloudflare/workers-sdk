// src/shim.ts
import worker from "__ENTRY_POINT__";
export * from "__ENTRY_POINT__";

// src/index.ts
var D1Database = class {
	constructor(binding) {
		this.binding = binding;
	}
	prepare(query) {
		return new D1PreparedStatement(this, query);
	}
	async dump() {
		const response = await this.binding.fetch("/dump", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
		});
		if (response.status !== 200) {
			const err = await response.json();
			throw new Error("D1_DUMP_ERROR", {
				cause: new Error(err.error),
			});
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
		const _exec = await this._send("/query", lines, []);
		const exec = Array.isArray(_exec) ? _exec : [_exec];
		const error = exec
			.map((r) => {
				return r.error ? 1 : 0;
			})
			.indexOf(1);
		if (error !== -1) {
			throw new Error("D1_EXEC_ERROR", {
				cause: new Error(
					`Error in line ${error + 1}: ${lines[error]}: ${exec[error].error}`
				),
			});
		} else {
			return {
				count: exec.length,
				duration: exec.reduce((p, c) => {
					return p + c.duration;
				}, 0),
			};
		}
	}
	async _send(endpoint, query, params) {
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
		const response = await this.binding.fetch(endpoint, {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body,
		});
		if (response.status !== 200) {
			const err = await response.json();
			throw new Error("D1_ERROR", { cause: new Error(err.error) });
		}
		const answer = await response.json();
		return Array.isArray(answer) ? answer : answer;
	}
};
var D1PreparedStatement = class {
	constructor(database, statement, values) {
		this.database = database;
		this.statement = statement;
		this.params = values || [];
	}
	bind(...values) {
		return new D1PreparedStatement(this.database, this.statement, values);
	}
	async first(colName) {
		const info = firstIfArray(
			await this.database._send("/query", this.statement, this.params)
		);
		const results = info.results;
		if (results.length < 1) {
			throw new Error("D1_NORESULTS", { cause: new Error("No results") });
		}
		const result = results[0];
		if (colName !== void 0) {
			if (result[colName] === void 0) {
				throw new Error("D1_COLUMN_NOTFOUND", {
					cause: new Error(`Column not found`),
				});
			}
			return result[colName];
		} else {
			return result;
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

// src/shim.ts
var D1_IMPORTS = __D1_IMPORTS__;
var LOCAL_MODE = __LOCAL_MODE__;
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
		const newBinding = !LOCAL_MODE
			? new D1Database(env[bindingName])
			: env[bindingName];
		newEnv.set(newName, newBinding);
	});
	const newEnvObj = Object.fromEntries(newEnv.entries());
	envMap.set(env, newEnvObj);
	return newEnvObj;
}
var shim_default = {
	async fetch(request, env, ctx) {
		return worker.fetch(request, getMaskedEnv(env), ctx);
	},

	async scheduled(controller, env, ctx) {
		return worker.scheduled(controller, getMaskedEnv(env), ctx);
	},
};
export { shim_default as default };
