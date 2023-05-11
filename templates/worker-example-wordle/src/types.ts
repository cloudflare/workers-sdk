export namespace Message {
	export type Incoming = { type: 'refresh' } | Message.Guess | Message.Ping;

	export type Outgoing =
		| { type: 'clear-keyboard' }
		| { type: 'clear-buttons' }
		| { type: 'shake-input' }
		| { type: 'celebrate' }
		| Message.Pong
		| Message.Refresh
		| Message.Announce
		| Message.GuessResult;

	// ---

	export interface Ping {
		type: 'ping';
		data: {
			id: string;
		};
	}

	export interface Pong {
		type: 'pong';
		data: {
			id: string;
			time: number;
			players: number;
			score: number;
		};
	}

	export interface Guess {
		type: 'guess';
		data: {
			letters: string[];
		};
	}

	export interface GuessResult {
		type: 'guess';
		data: {
			letters: Guess.Check[][];
		};
	}

	export interface Refresh {
		type: 'refresh';
		data: {
			guesses: Guess.Check[][];
		};
	}

	export interface Announce {
		type: 'announce';
		data: {
			style: string;
			message: string;
		};
	}
}

export namespace Guess {
	export interface Check {
		letter: string;
		color: string;
	}

	export type Response =
		| { success: true; word: string; letters: Check[] }
		| { success: false; error: string };
}
