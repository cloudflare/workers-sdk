export class AssetsManifest {
	private data: ArrayBuffer;

	constructor(data: ArrayBuffer) {
		this.data = data;
	}

	async get(pathname: string) {
		return Promise.resolve(pathname);
	}
}
