import { ReadableStream } from "node:stream/web";
import { DurableObjectStub } from "@cloudflare/workers-types/experimental";
import { ReplaceWorkersTypes } from "miniflare";

export class MiniflareDurableObjectControlStub {
	constructor(private readonly stub: ReplaceWorkersTypes<DurableObjectStub>) {}

	async #call<T>(name: string, ...args: unknown[]): Promise<T> {
		const response = await this.stub.fetch("http://placeholder/", {
			cf: { miniflare: { controlOp: { name, args } } },
		});
		const result = response.json();
		return (result ?? undefined) as T;
	}

	sqlQuery<T>(query: string, ...params: unknown[]): Promise<T[]> {
		return this.#call("sqlQuery", query, ...params);
	}

	async getBlob(id: string): Promise<ReadableStream | null> {
		const response = await this.stub.fetch("http://placeholder/", {
			cf: { miniflare: { controlOp: { name: "getBlob", args: [id] } } },
		});
		if (response.status === 404) {
			await response.arrayBuffer();
			return null;
		}
		return response.body;
	}

	enableFakeTimers(timestamp: number): Promise<void> {
		return this.#call("enableFakeTimers", timestamp);
	}
	disableFakeTimers(): Promise<void> {
		return this.#call("disableFakeTimers");
	}
	advanceFakeTime(delta: number): Promise<void> {
		return this.#call("advanceFakeTime", delta);
	}
	waitForFakeTasks(): Promise<void> {
		return this.#call("waitForFakeTasks");
	}
}
