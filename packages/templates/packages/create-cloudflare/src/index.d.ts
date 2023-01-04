export interface Argv {
	init?: boolean;
	force?: boolean;
	debug?: boolean;
}

export function setup(dest: string, source: string, argv: Argv): Promise<void>;
