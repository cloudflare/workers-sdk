import { usePartySocket } from "partysocket/react";
import { useState } from "react";
import "./tailwind.css";

function App() {
	const [message, setMessage] = useState();
	const socket = usePartySocket({
		party: "my-server",
		room: "room1",
		onMessage(msg) {
			setMessage(msg.data);
		},
	});

	return (
		<main>
			<h1>Vite + React + PartyServer</h1>
			<button
				onClick={() => socket.send("Hello from the client!")}
				aria-label="send message"
			>
				Send message
			</button>
			<p>{message}</p>
		</main>
	);
}

export default App;
