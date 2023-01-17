interface Image {
	id: string;
	previewURL: string;
	name: string;
	alt: string;
	uploaded: string;
	isPrivate: boolean;
	downloadCount: number;
}

interface ImageMetadata {
	id: string;
	previewURLBase: string;
	name: string;
	alt: string;
	uploaded: string;
	isPrivate: boolean;
	downloadCounterId: string;
}

interface Setup {
	apiToken: string;
	accountId: string;
	imagesKey: string;
}

/*** Will be in @cloudflare/workers-types shortly ***/

type Params<P extends string = any> = Record<P, string | string[]>;

type EventContext<Env, P extends string, Data> = {
	request: Request;
	waitUntil: (promise: Promise<any>) => void;
	next: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
	env: Env;
	params: Params<P>;
	data: Data;
};

declare type PagesFunction<
	Env = unknown,
	Params extends string = any,
	Data extends Record<string, unknown> = Record<string, unknown>
> = (context: EventContext<Env, Params, Data>) => Response | Promise<Response>;
