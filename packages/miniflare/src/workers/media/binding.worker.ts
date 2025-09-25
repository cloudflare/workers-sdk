import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";

type Env = {
	remote: Fetcher;
};

type FitOption = "contain" | "cover" | "scale-down";
type FormatOption = "jpg" | "png" | "m4a";
type ModeOption = "video" | "spritesheet" | "frame" | "audio";

type MediaTransformationInputOptions = {
	fit?: FitOption;
	width?: number;
	height?: number;
};

type MediaTransformationOutputOptions = {
	mode?: ModeOption;
	audio?: boolean;
	time?: string;
	duration?: string;
	format?: FormatOption;
	imageCount?: number;
};

export default class MediaBinding extends WorkerEntrypoint<Env> {
	async input(media: ReadableStream<Uint8Array>): Promise<MediaTransformer> {
		return new MediaTransformer(this.env.remote, media);
	}
}

class MediaTransformer extends RpcTarget {
	constructor(
		private remote: Fetcher,
		private input: ReadableStream<Uint8Array>
	) {
		super();
	}

	transform(
		options: MediaTransformationInputOptions
	): MediaTransformationGenerator {
		return new MediaTransformationGenerator(this.remote, this.input, options);
	}
}

class MediaTransformationGenerator extends RpcTarget {
	constructor(
		private remote: Fetcher,
		private input: ReadableStream<Uint8Array>,
		private inputOptions: MediaTransformationInputOptions
	) {
		super();
	}

	async output(
		outputOptions: MediaTransformationOutputOptions
	): Promise<MediaTransformationResult> {
		const resp = await this.remote.fetch(`http://example.com`, {
			body: this.input,
			method: "POST",
			headers: {
				"x-cf-media-input-options": JSON.stringify(this.inputOptions),
				"x-cf-media-output-options": JSON.stringify(outputOptions),
			},
		});

		const contentType = resp.headers.get("x-cf-media-content-type") as string;

		return new MediaTransformationResult(
			resp.body as ReadableStream,
			contentType
		);
	}
}

class MediaTransformationResult extends RpcTarget {
	constructor(
		private responseStream: ReadableStream<Uint8Array>,
		private responseContentType: string
	) {
		super();
	}

	media() {
		const [stream1, stream2] = this.responseStream.tee();
		this.responseStream = stream1;
		return stream2;
	}

	response() {
		const [stream1, stream2] = this.responseStream.tee();
		this.responseStream = stream1;
		return new Response(stream2, {
			headers: {
				"Content-Type": this.contentType(),
			},
		});
	}

	contentType() {
		return this.responseContentType;
	}
}
