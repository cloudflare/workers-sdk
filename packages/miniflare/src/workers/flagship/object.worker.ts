import { DurableObject } from "cloudflare:workers";
import { toStoredFlag, validateFlagInput } from "./flags";
import type { Flag, FlagChanges, FlagInput } from "./flags";

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS flags (
		key        TEXT PRIMARY KEY,
		definition TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS metadata (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`,
];

const ACCOUNT_TAG_KEY = "accountTag";

export type WriteResult =
	| { status: "written"; flag: Flag }
	| { status: "invalid"; message: string }
	| { status: "missing" }
	| { status: "exists" };

type InvalidResult = Extract<WriteResult, { status: "invalid" }>;

function invalidResult(input: FlagInput): InvalidResult | undefined {
	try {
		validateFlagInput(input);
	} catch (error) {
		return {
			status: "invalid",
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

export class FlagshipObject extends DurableObject {
	private sql = this.ctx.storage.sql;

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env as never);
		this.ctx.blockConcurrencyWhile(async () => {
			for (const statement of SCHEMA) {
				this.sql.exec(statement);
			}
		});
	}

	list(): Flag[] {
		return [
			...this.sql.exec<{ definition: string }>(
				"SELECT definition FROM flags ORDER BY key"
			),
		].map((row) => JSON.parse(row.definition) as Flag);
	}

	get(key: string): Flag | null {
		const [row] = [
			...this.sql.exec<{ definition: string }>(
				"SELECT definition FROM flags WHERE key = ?",
				key
			),
		];
		return row === undefined ? null : (JSON.parse(row.definition) as Flag);
	}

	getAccountTag(): string | null {
		const [row] = [
			...this.sql.exec<{ value: string }>(
				"SELECT value FROM metadata WHERE key = ?",
				ACCOUNT_TAG_KEY
			),
		];
		return row?.value ?? null;
	}

	setAccountTag(accountTag: string): void {
		this.#writeAccountTag(accountTag);
	}

	getForEvaluation(key: string): {
		flag: Flag | null;
		accountTag: string | null;
	} {
		return { flag: this.get(key), accountTag: this.getAccountTag() };
	}

	create(input: FlagInput): WriteResult {
		const invalid = invalidResult(input);
		if (invalid !== undefined) {
			return invalid;
		}
		if (this.get(input.key) !== null) {
			return { status: "exists" };
		}
		return this.#writeResult(input);
	}

	update(key: string, input: FlagInput): WriteResult {
		if (this.get(key) === null) {
			return { status: "missing" };
		}
		return this.#validateAndWrite({ ...input, key });
	}

	patch(key: string, changes: FlagChanges): WriteResult {
		const current = this.get(key);
		if (current === null) {
			return { status: "missing" };
		}
		const next: FlagInput = {
			key,
			description:
				changes.description === undefined
					? current.description
					: changes.description,
			enabled: changes.enabled ?? current.enabled,
			default_variation: changes.default_variation ?? current.default_variation,
			variations: changes.variations ?? current.variations,
			rules: changes.rules ?? current.rules,
		};
		return this.#validateAndWrite(next);
	}

	put(input: FlagInput): WriteResult {
		return this.#validateAndWrite(input);
	}

	putAll(
		inputs: FlagInput[],
		accountTag: string
	): { status: "written" } | { status: "invalid"; message: string } {
		for (const input of inputs) {
			const invalid = invalidResult(input);
			if (invalid !== undefined) {
				return invalid;
			}
		}
		const stored = inputs.map(toStoredFlag);
		this.ctx.storage.transactionSync(() => {
			this.#writeAccountTag(accountTag);
			for (const flag of stored) {
				this.#write(flag);
			}
		});
		return { status: "written" };
	}

	delete(key: string): boolean {
		if (this.get(key) === null) {
			return false;
		}
		this.sql.exec("DELETE FROM flags WHERE key = ?", key);
		return true;
	}

	#validateAndWrite(input: FlagInput): WriteResult {
		return invalidResult(input) ?? this.#writeResult(input);
	}

	#writeResult(input: FlagInput): WriteResult {
		return { status: "written", flag: this.#write(toStoredFlag(input)) };
	}

	#write(flag: Flag): Flag {
		this.sql.exec(
			`INSERT INTO flags (key, definition) VALUES (?, ?)
				ON CONFLICT (key) DO UPDATE SET definition = excluded.definition`,
			flag.key,
			JSON.stringify(flag)
		);
		return flag;
	}

	#writeAccountTag(accountTag: string): void {
		this.sql.exec(
			`INSERT INTO metadata (key, value) VALUES (?, ?)
				ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			ACCOUNT_TAG_KEY,
			accountTag
		);
	}
}
