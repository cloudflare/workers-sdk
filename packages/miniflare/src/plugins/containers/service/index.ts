import { ContainerOptions } from "../index";

export class ContainerService {
	#containerOptions: ContainerOptions;
	constructor(containerOptions: ContainerOptions) {
		this.#containerOptions = containerOptions;
		this.help();
	}

	updateConfig(containerOptions: ContainerOptions): void {
		this.#containerOptions = containerOptions;
		this.help();
	}

	help() {
		console.log("Hello from ContainerService!");
		console.log(
			`Container Options: ${JSON.stringify(this.#containerOptions, null, 2)}`
		);
	}
}
