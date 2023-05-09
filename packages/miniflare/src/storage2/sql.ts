import { Database, Statement } from "better-sqlite3";

// `better-sqlite3`'s `Statement` methods have `any`-typed return values.
// Define types that define the return type at `prepare()` time.

export type TypedStatement<
	Params extends any[] = unknown[],
	SingleResult = unknown,
> = Omit<Statement<Params>, "get" | "all" | "iterate"> & {
	get(...params: Params): SingleResult | undefined;
	all(...params: Params): SingleResult[];
	iterate(...params: Params): IterableIterator<SingleResult>;
};

export type TypedDatabase = Omit<Database, "prepare"> & {
	prepare<Params = unknown[], SingleResult = unknown>(
		source: string
	): Params extends any[]
		? TypedStatement<Params, SingleResult>
		: TypedStatement<[Params], SingleResult>;
};
