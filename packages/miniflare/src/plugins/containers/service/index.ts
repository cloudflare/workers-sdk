import { ContainerOptions, ContainersSharedOptions } from "../index";

export class ContainerService {
	#containerOptions: { [className: string]: ContainerOptions };
	#sharedOptions: ContainersSharedOptions;
	constructor(
		containerOptions: { [className: string]: ContainerOptions },
		sharedOptions: ContainersSharedOptions
	) {
		this.#containerOptions = containerOptions;
		this.#sharedOptions = sharedOptions;
		this.help();
	}

	updateConfig(
		containerOptions: {
			[className: string]: ContainerOptions;
		},
		sharedOptions: ContainersSharedOptions
	): void {
		this.#containerOptions = containerOptions;
		this.#sharedOptions = sharedOptions;
		this.help();
	}

	help() {
		console.log("Hello from ContainerService!");
		console.log(
			`Container Options: ${JSON.stringify(this.#containerOptions, null, 2)}`
		);
		console.log(
			`Shared Options: ${JSON.stringify(this.#sharedOptions, null, 2)}`
		);
	}
}
