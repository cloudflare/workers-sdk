import { words } from './words';
import type { Message, Guess } from './types';

interface Controller {
	storage: DurableObjectStorage;
}

export class WordleDurableObject {
	storage: DurableObjectStorage;
	webSockets: WebSocket[];

	currentWord = '';
	currentGuessResults: Guess.Check[][] = [];

	constructor(controller: Controller) {
		// `controller.storage` provides access to our durable storage. It provides a simple KV
		// get()/put() interface.
		this.storage = controller.storage;

		// We will put the WebSocket objects for each client into `websockets`
		this.webSockets = [];
	}

	async getScore(): Promise<number> {
		return (await this.storage.get<number>('score')) || 0;
	}

	async fetch() {
		// To accept the WebSocket request, we create a WebSocketPair (which is like a socketpair,
		// i.e. two WebSockets that talk to each other), we return one end of the pair in the
		// response, and we operate on the other end. Note that this API is not part of the
		// Fetch API standard; unfortunately, the Fetch API / Service Workers specs do not define
		// any way to act as a WebSocket server today.
		let pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		// We're going to take pair[1] as our end, and return pair[0] to the client.
		await this.handleSession(server);

		// Now we return the other end of the pair to the client.
		return new Response(null, { status: 101, webSocket: client });
	}

	async handleSession(webSocket: WebSocket) {
		// Accept our end of the WebSocket. This tells the runtime that we'll be terminating the
		// WebSocket in JavaScript, not sending it elsewhere.
		webSocket.accept();

		// Create our session and add it to the sessions list.
		// We don't send any messages to the client until it has sent us the initial user info
		// message. Until then, we will queue messages in `session.blockedMessages`.
		this.webSockets.push(webSocket);

		webSocket.addEventListener('message', async msg => {
			try {
				// Parse the incoming message
				const message = JSON.parse(
					typeof msg.data === 'string' ? msg.data : new TextDecoder().decode(msg.data)
				) as Message.Incoming;

				//console.log('incoming message', message);

				const replies: Message.Outgoing[] = [];
				const broadcasts: Message.Outgoing[] = [];

				switch (message.type) {
					case 'refresh':
						replies.push({
							type: 'refresh',
							data: {
								guesses: this.currentGuessResults,
							},
						});
						break;
					case 'ping':
						replies.push({
							type: 'pong',
							data: {
								time: Date.now(),
								id: message.data.id,
								players: this.webSockets.length,
								score: await this.getScore(),
							},
						});
						break;
					case 'guess':
						if (!this.currentWord) {
							this.rotateWord();
						}

						// clear player's boards when word was rotated
						if (!this.currentGuessResults.length) {
							broadcasts.push({
								type: 'refresh',
								data: {
									guesses: Array.from({ length: 6 }, () => [] as Guess.Check[]),
								},
							});

							broadcasts.push({
								type: 'clear-buttons',
							});
						}

						const guessResults = this.checkGuess(message.data.letters);

						if (guessResults.success) {
							this.currentGuessResults.push(guessResults.letters);

							replies.push({
								type: 'clear-keyboard',
							});

							// refresh all player's boards
							broadcasts.push({
								type: 'refresh',
								data: {
									guesses: this.currentGuessResults,
								},
							});

							// celebrate match
							const fullMatch = this.currentWord === guessResults.word;
							if (fullMatch) {
								let score = await this.getScore();
								this.storage.put('score', ++score);
								broadcasts.push({ type: 'celebrate' });
							} else if (this.currentGuessResults.length >= 6) {
								let score = await this.getScore();
								this.storage.put('score', --score);
							}

							if (this.currentGuessResults.length >= 6 || fullMatch) {
								broadcasts.push({
									type: 'clear-buttons',
								});

								broadcasts.push({
									type: 'announce',
									data: {
										style: fullMatch ? 'success' : 'error',
										message: `The word was ${this.currentWord.toLocaleUpperCase()}`,
									},
								});

								this.rotateWord();
							} else {
								broadcasts.push({
									type: 'announce',
									data: {
										style: '',
										message: '',
									},
								});
							}
						} else {
							replies.push({
								type: 'shake-input',
							});

							replies.push({
								type: 'announce',
								data: {
									style: 'error',
									message: guessResults.error,
								},
							});
						}
						break;
				}

				if (replies.length) webSocket.send(JSON.stringify(replies));
				if (broadcasts.length) this.broadcast(JSON.stringify(broadcasts));
			} catch (err) {
				// Report any exceptions directly back to the client. As with our handleErrors() this
				// probably isn't what you'd want to do in production, but it's convenient when testing.
				webSocket.send(JSON.stringify({ error: err.stack }));
			}
		});

		// On "close" and "error" events, remove the WebSocket from the webSockets list
		let closeOrErrorHandler = () => {
			this.webSockets = this.webSockets.filter(w => w !== webSocket);
		};
		webSocket.addEventListener('close', closeOrErrorHandler);
		webSocket.addEventListener('error', closeOrErrorHandler);
	}

	// broadcast() broadcasts a message to all clients.
	broadcast(message: string) {
		// Iterate over all the sessions sending them messages.
		this.webSockets = this.webSockets.filter(w => {
			try {
				w.send(message);
				return true;
			} catch (err) {
				return false;
			}
		});
	}

	checkGuess(guessLetters: string[]): Guess.Response {
		let rightGuess = Array.from(this.currentWord);
		let checkedLetters: Guess.Check[] = [];
		let guessWord = '';

		for (const val of guessLetters) {
			guessWord += val;
		}

		if (guessWord.length !== 5) {
			return {
				success: false,
				error: 'Not enough letters!',
			};
		}

		if (!words.includes(guessWord)) {
			return {
				success: false,
				error: 'Word not in list!',
			};
		}

		for (let i = 0; i < 5; i++) {
			let color = '';

			let letterPosition = rightGuess.indexOf(guessLetters[i]);
			// is letter in the correct guess
			if (letterPosition === -1) {
				color = 'grey';
			} else {
				// now, letter is definitely in word
				// if letter index and right guess index are the same
				// letter is in the right position
				if (guessLetters[i] === rightGuess[i]) {
					// shade green
					color = 'green';
				} else {
					// shade box yellow
					color = 'yellow';
				}
			}

			checkedLetters.push({
				letter: guessLetters[i],
				color,
			});
		}

		return {
			success: true,
			word: guessWord,
			letters: checkedLetters,
		};
	}

	rotateWord() {
		this.currentWord = words[Math.floor(Math.random() * words.length)];
		this.currentGuessResults = [];
	}
}
