export interface Logger {
	debug: (message: string) => void;
	log: (message: string) => void;
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (error: Error) => void;
}

export type BuildArgs = {
	tag: string;
	pathToDockerfile: string;
	buildContext: string;
	args?: Record<string, string>;
	platform?: string;
	setNetworkToHost?: boolean;
};
