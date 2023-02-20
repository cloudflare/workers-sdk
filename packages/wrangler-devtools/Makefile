ROOT = $(realpath .)
# The upstream devtools commit upon which our patches are based
HEAD = f931aec3eca7c860dc4d657f328daca19d19221d
PATCHES = $(shell ls ${PWD}/patches/*.patch)
depot:
	git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git depot

devtools-frontend: depot
	$(ROOT)/depot/fetch devtools-frontend
	git -C devtools-frontend checkout $(HEAD)
	git -C devtools-frontend config user.email "workers-devprod@cloudflare.com"
	git -C devtools-frontend config user.name "Workers DevProd"
	git -C devtools-frontend am $(PATCHES)

devtools-frontend/out/Default/gen/front_end: devtools-frontend
	cd devtools-frontend && $(ROOT)/depot/gclient sync
	cd devtools-frontend && $(ROOT)/depot/gn gen out/Default
	cd devtools-frontend && $(ROOT)/depot/autoninja -C out/Default

node_modules:
	npm ci

publish: node_modules devtools-frontend/out/Default/gen/front_end
	npx wrangler pages publish --project-name cloudflare-devtools devtools-frontend/out/Default/gen/front_end

cleanup:
	rm -rf devtools-frontend .gclient* .cipd node_modules depot

test:
	git -C devtools-frontend am $(PATCHES)