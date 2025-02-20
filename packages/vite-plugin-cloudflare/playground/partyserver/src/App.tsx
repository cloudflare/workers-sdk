import { usePartySocket } from "partysocket/react";
import { useState } from "react";

function App() {
	const [message, setMessage] = useState();
	const socket = usePartySocket({
		party: "my-server",
		room: "room1",
		onMessage(message) {
			setMessage(message.data);
		},
	});

	return (
		<main>
			<h1>Vite + React + PartyServer</h1>
			<button
				onClick={() => socket.send("Hello from the client!")}
				aria-label="get-name"
			>
				Send message
			</button>
			<p>Message from the server: {message}</p>
		</main>
	);
}

export default App;
