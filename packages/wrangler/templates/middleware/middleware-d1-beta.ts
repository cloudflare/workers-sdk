/// <reference path="middleware-d1-beta.d.ts"/>

import { D1_IMPORTS } from "config:middleware/d1-beta";

// src/index.ts
class D1Database {
	constructor(readonly binding: Fetcher) {}
	prepare(query: string) {
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
				const err = (await response.json()) as { error: string };
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
	async batch(statements: D1PreparedStatement[]) {
		const exec = await this._send(
			"/query",
			statements.map((s) => s.statement),
			statements.map((s) => s.params)
		);
		return exec;
	}
	async exec(query: string) {
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
					return p + (c.meta.duration as number);
				}, 0),
			};
		}
	}
	async _send(
		endpoint: string,
		query: string | string[],
		params: unknown[],
		dothrow = true
	) {
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
			const answer = (await response.json()) as { error?: string };
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
			const error = e as Error;
			throw new Error(`D1_ERROR: ${error.cause || "Something went wrong"}`, {
				cause: new Error(`${error.cause}` || "Something went wrong"),
			});
		}
	}
}

class D1PreparedStatement {
	constructor(
		readonly database: D1Database,
		readonly statement: string,
		readonly params: unknown[] = []
	) {}
	bind(...values: unknown[]) {
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
	async first(colName: string) {
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
}
function firstIfArray(results: unknown) {
	return Array.isArray(results) ? results[0] : results;
}
function mapD1Result(result: Partial<D1Result>): D1Result {
	let map: D1Result = {
		results: result.results || [],
		success: result.success === void 0 ? true : result.success,
		meta: result.meta || {},
	};
	result.error && (map.error = result.error);
	return map;
}

type D1Result = {
	results: unknown[];
	success: boolean;
	meta: Record<string, unknown>;
	error?: string;
};

// src/shim.ts
var D1_BETA_PREFIX = `__D1_BETA__`;
var envMap = /* @__PURE__ */ new Map();
function getMaskedEnv(env: Record<string, Fetcher | D1Database>) {
	if (envMap.has(env)) return envMap.get(env);
	const newEnv = new Map(Object.entries(env));
	D1_IMPORTS.filter((bindingName) =>
		bindingName.startsWith(D1_BETA_PREFIX)
	).forEach((bindingName) => {
		newEnv.delete(bindingName);
		const newName = bindingName.slice(D1_BETA_PREFIX.length);
		const newBinding = new D1Database(env[bindingName] as Fetcher);
		newEnv.set(newName, newBinding);
	});
	const newEnvObj = Object.fromEntries(newEnv.entries());
	envMap.set(env, newEnvObj);
	return newEnvObj;
}

export function wrap(env: Record<string, D1Database | Fetcher>) {
	return getMaskedEnv(env);
}
