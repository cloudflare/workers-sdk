export type CommonEventProperties = {
	/** The version of the wrangler client that is sending the event. */
	wranglerVersion: string;
	/**
	 * The platform that the wrangler client is running on.
	 */
	platform: string;
	/**
	 * The package manager that the wrangler client is using.
	 */
	packageManager: string | undefined;
	/**
	 * Whether this is the first time the user has used the wrangler client.
	 */
	isFirstUsage: boolean;

	amplitude_session_id: number;
	amplitude_event_id: number;
};

export type Events =
	| {
			name: "wrangler command started";
			properties: CommonEventProperties & {
				command: string;
				args: Record<string, unknown>;
			};
	  }
	| {
			name: "wrangler command completed";
			properties: CommonEventProperties & {
				command: string | undefined;
				args: Record<string, unknown> | undefined;
				durationMs: number;
				durationMinutes: number;
				durationSeconds: number;
			};
	  }
	| {
			name: "wrangler command errored";
			properties: CommonEventProperties & {
				command: string | undefined;
				args: Record<string, unknown> | undefined;
				durationMs: number;
				durationMinutes: number;
				durationSeconds: number;
				errorType: string | undefined;
			};
	  };
