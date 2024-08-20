# Page Functions fixture

This directory is just here to avoid picking up any other \_worker.js files in the other app.
The actual Pages Functions handlers are in the `functions` directory at the root of the fixture.
They have to be there because Pages likes `wrangler pages dev` to be run from the root of the fixture and it always looks for a `functions` directory in that root.
