#!/usr/bin/env make

default:
	@echo "Available Targets:"
	@echo
	@echo "  dev - remote dev"
	@echo "  publish - publish to production"
	@echo "  tail - tail production logs"
	@echo

.PHONY:

dev:
	NO_CONSTELLATION_WARNING=true npx wrangler dev --env dev --remote --ip 127.0.0.1 --port 9000

publish:
	NO_CONSTELLATION_WARNING=true npx wrangler publish --env production

tail:
	NO_CONSTELLATION_WARNING=true npx wrangler tail --env production

