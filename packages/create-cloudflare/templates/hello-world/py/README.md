## Usage

You can run the worker defined by your new project by executing `wrangler dev` in this
directory. This will start up an HTTP server and will allow you to iterate on your
worker without having to restart `wrangler`.

### Types and autocomplete

This project also includes a pyproject.toml and uv.lock file with some requirements which
set up autocomplete and type hints for this Python Workers project. To get these installed
you can run the following:

```
uv venv
uv sync
```

Then point your editor's Python plugin at the `.venv` directory.
