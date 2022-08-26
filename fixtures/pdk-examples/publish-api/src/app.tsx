import * as React from "react";

import { createRoot } from "react-dom/client";

/**
 * Let's build a React App that has an editor that can be used to edit a typescript file
 */
function App() {
	return (
		<div>
			<textarea id="code"></textarea>
			<button
				onClick={(_e) => {
					const form = new FormData();
					form.set("content", document.getElementById("code").value);
					form.set("name", "Name of the document");
					// form.set('clock', )

					fetch("/fns/abc", {
						method: "POST",
						body: form,
					})
						.then(async (res) => {
							console.log(await res.json());
						})
						.catch((err) => {
							console.error(err);
						});
				}}
			>
				publish
			</button>
		</div>
	);
}

createRoot(document.getElementById("root")).render(<App />);
