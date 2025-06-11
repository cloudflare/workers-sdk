import { ContainerOptions, ContainersSharedOptions } from "../index";

/**
 * ContainerController manages container configuration, building or pulling
 * containers, and cleaning up containers at the end of the dev session.
 */
export class ContainerController {
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
		console.log("Hello from ContainerController!");
		console.log(
			`Container Options: ${JSON.stringify(this.#containerOptions, null, 2)}`
		);
		console.log(
			`Shared Options: ${JSON.stringify(this.#sharedOptions, null, 2)}`
		);
	}
}
