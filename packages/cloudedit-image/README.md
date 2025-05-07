# `cloudedit-image`

This is a Hono-based Node.js server running in Cloudflare's container platform. It's single-tenant, meaning that a single instance of this server supports a single Cloudedit session/client.

It's responsible for two things:

1. Exposing the terminal. Cloudedit clients can run terminal commands in their Cloudedit session—that's the whole point! That happens by way of an Xterm.js connection on the client side, but on the server side this is a WS connection that pipes everything it receives to a node-pty instance. This is very simple: on WS connection, optionally close an existing socket, and start up a new terminal session. This means that browser reloads don't have to deal with session resuming—it's always a clean start.

2. Exposing the filesystem. For Cloudedit clients to do anything useful in the filesystem, they should be able to write files to it. This involves an initial one directional seeding (from the client), and then continuous bi-directional syncing (client to filesystem write, chokidar filesystem watch back to client)
