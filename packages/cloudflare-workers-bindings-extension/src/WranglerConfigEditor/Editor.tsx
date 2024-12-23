import React, { useEffect, useState } from "react";

// @ts-expect-error global variable from vscode
const vscode = acquireVsCodeApi();

export default function Editor() {
	const [state, setState] = useState<string>(() => vscode.getState());
	const config = state ? JSON.parse(state) : {};

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data; // The json data that the extension sent
			switch (message.type) {
				case "update":
					const text = message.text;

					// Update our webview's content
					setState(text);

					// Then persist state information.
					// This state is returned in the call to `vscode.getState` below when a webview is reloaded.
					vscode.setState(text);
					break;
			}
		};

		// Handle messages sent from the extension to the webview
		window.addEventListener("message", handleMessage);

		return () => {
			window.removeEventListener("message", handleMessage);
		};
	}, []);

	return (
		<div className="container mx-auto">
			<h1 className="text-3xl pb-2">Wrangler Configuration</h1>
			<form className="py-2 space-y-2">
				<div>
					<label htmlFor="name">
						<h3 className="font-bold">name</h3>
						<p className="text-gray-300">The name of your Worker</p>
					</label>
					<div className="py-2">
						<input
							id="name"
							className="max-w-xs"
							type="text"
							name="name"
							value={config.name}
							onChange={(event) => {
								vscode.postMessage({
									type: "update",
									name: event.target.name,
									value: event.target.value,
								});
							}}
							placeholder="Alphanumeric characters (a,b,c, etc.) and dashes (-) only. Do not use underscores (_)."
						/>
					</div>
				</div>
				<div>
					<label htmlFor="compatibility_date">
						<h3 className="font-bold">compatibility_date</h3>
						<p className="text-gray-300">
							A date in the form yyyy-mm-dd, which will be used to determine
							which version of the Workers runtime is used. Refer to
							Compatibility dates.
						</p>
					</label>
					<div className="py-2">
						<input
							id="compatibility_date"
							className="max-w-xs"
							name="compatibility_date"
							type="date"
							onChange={(event) => {
								vscode.postMessage({
									type: "update",
									name: event.target.name,
									value: event.target.value,
								});
							}}
							value={config.compatibility_date}
							placeholder="yyyy-mm-dd"
						/>
					</div>
				</div>
				<div className="pt-4">
					<h2 className="text-2xl">d1_databases</h2>
					<p className="pb-4 text-gray-300">
						D1 is Cloudflare's serverless SQL database. A Worker can query a D1
						database (or databases) by creating a binding to each database for
						D1 Workers Binding API.
					</p>
					<div className="space-y-4">
						{config.d1_databases?.map((d1: any, index: number) => (
							<details className="border border-dotted border-gray-300 p-4">
								<summary>
									<span className="px-2">
										{d1.binding ?? "<NO_BINDING_NAME>"}
									</span>
								</summary>
								<div className="pt-4 py-2">
									<label htmlFor={`d1_databases[${index}].binding`}>
										<h3 className="font-bold">binding</h3>
										<p className="text-gray-300">
											The binding name used to refer to the D1 database. The
											value (string) you set will be used to reference this
											database in your Worker. The binding must be a valid
											JavaScript variable name.
										</p>
									</label>
									<div className="py-2">
										<input
											id={`d1_databases[${index}].binding`}
											className="max-w-xs"
											type="text"
											name={`d1_databases[${index}].binding`}
											value={d1.binding}
											onChange={(event) => {
												vscode.postMessage({
													type: "update",
													name: event.target.name,
													value: event.target.value,
												});
											}}
											placeholder="For example, MY_DB or productionDB would both be valid names for the binding"
										/>
									</div>
								</div>
								<div className="py-2">
									<label htmlFor={`d1_databases[${index}].database_name`}>
										<h3 className="font-bold">database_name</h3>
										<p className="text-gray-300">
											The name of the database. This is a human-readable name
											that allows you to distinguish between different
											databases, and is set when you first create the database.
										</p>
									</label>
									<div className="py-2">
										<input
											id={`d1_databases[${index}].database_name`}
											className="max-w-xs"
											type="text"
											name={`d1_databases[${index}].database_name`}
											value={d1.database_name}
											onChange={(event) => {
												vscode.postMessage({
													type: "update",
													name: event.target.name,
													value: event.target.value,
												});
											}}
										/>
									</div>
								</div>
								<div className="py-2">
									<label htmlFor={`d1_databases[${index}].database_id`}>
										<h3 className="font-bold">database_id</h3>
										<p className="text-gray-300">
											The ID of the database. The database ID is available when
											you first use wrangler d1 create or when you call wrangler
											d1 list, and uniquely identifies your database.
										</p>
									</label>
									<div className="py-2">
										<input
											id={`d1_databases[${index}].database_id`}
											className="max-w-xs"
											type="text"
											name={`d1_databases[${index}].database_id`}
											value={d1.database_id}
											onChange={(event) => {
												vscode.postMessage({
													type: "update",
													name: event.target.name,
													value: event.target.value,
												});
											}}
										/>
									</div>
								</div>
							</details>
						))}
					</div>
					<div className="max-w-xs">
						<button
							type="button"
							className="mt-4 py-2 secondary"
							onClick={() => {
								vscode.postMessage({
									type: "add",
									name: "d1_databases",
								});
							}}
						>
							Add
						</button>
					</div>
				</div>
			</form>
		</div>
	);
}
