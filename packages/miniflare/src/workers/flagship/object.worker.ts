import { DurableObject } from "cloudflare:workers";
import type { Flag } from "./flags";

const FLAG_PREFIX = "flag:";

// Kept outside FLAG_PREFIX so it never appears in `list()`.
const ACCOUNT_TAG_KEY = "meta:accountTag";

export class FlagshipObject extends DurableObject {
	async list(): Promise<Flag[]> {
		const entries = await this.ctx.storage.list<Flag>({ prefix: FLAG_PREFIX });
		return [...entries.values()].sort((a, b) => a.key.localeCompare(b.key));
	}

	async get(key: string): Promise<Flag | null> {
		return (await this.ctx.storage.get<Flag>(FLAG_PREFIX + key)) ?? null;
	}

	async getAccountTag(): Promise<string | null> {
		return (await this.ctx.storage.get<string>(ACCOUNT_TAG_KEY)) ?? null;
	}

	async setAccountTag(accountTag: string): Promise<void> {
		await this.ctx.storage.put(ACCOUNT_TAG_KEY, accountTag);
	}

	async getForEvaluation(
		key: string
	): Promise<{ flag: Flag | null; accountTag: string | null }> {
		const [flag, accountTag] = await Promise.all([
			this.get(key),
			this.getAccountTag(),
		]);
		return { flag, accountTag };
	}

	async put(flag: Flag): Promise<void> {
		await this.ctx.storage.put<Flag>(FLAG_PREFIX + flag.key, flag);
	}

	async delete(key: string): Promise<boolean> {
		return await this.ctx.storage.delete(FLAG_PREFIX + key);
	}
}
