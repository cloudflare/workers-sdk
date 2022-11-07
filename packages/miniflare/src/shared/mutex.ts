import assert from "assert";
import { Awaitable } from "./types";

export class Mutex {
	private locked = false;
	private resolveQueue: (() => void)[] = [];

	private lock(): Awaitable<void> {
		if (!this.locked) {
			this.locked = true;
			return;
		}
		return new Promise((resolve) => this.resolveQueue.push(resolve));
	}

	private unlock(): void {
		assert(this.locked);
		if (this.resolveQueue.length > 0) {
			this.resolveQueue.shift()?.();
		} else {
			this.locked = false;
		}
	}

	get hasWaiting(): boolean {
		return this.resolveQueue.length > 0;
	}

	async runWith<T>(closure: () => Awaitable<T>): Promise<T> {
		const acquireAwaitable = this.lock();
		if (acquireAwaitable instanceof Promise) await acquireAwaitable;
		try {
			const awaitable = closure();
			if (awaitable instanceof Promise) return await awaitable;
			return awaitable;
		} finally {
			this.unlock();
		}
	}
}
