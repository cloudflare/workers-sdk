ROOT = $(realpath .)
PATH_WITH_DEPOT = $(PATH):$(ROOT)/depot/
# The upstream devtools commit upon which our patches are based
HEAD = b66ecf5bef3ae6c769dbc6d904ce1c54d3771227
PATCHES = $(shell ls ${PWD}/patches/*.patch)
depot:
	git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git depot

devtools-frontend: depot
	git clone https://chromium.googlesource.com/devtools/devtools-frontend
  # Ensure other depot_tools can be called from gclient config
	PATH="$(PATH_WITH_DEPOT)" $(ROOT)/depot/gclient config https://chromium.googlesource.com/devtools/devtools-frontend --unmanaged
	git -C devtools-frontend checkout $(HEAD)
	git -C devtools-frontend config user.email "workers-devprod@cloudflare.com"
	git -C devtools-frontend config user.name "Workers DevProd"
	git -C devtools-frontend am $(PATCHES)

devtools-frontend/out/Default/gen/front_end: devtools-frontend
	cd devtools-frontend && PATH="$(PATH_WITH_DEPOT)" $(ROOT)/depot/gclient sync
	cd devtools-frontend && PATH="$(PATH_WITH_DEPOT)" $(ROOT)/depot/gn gen out/Default
	cd devtools-frontend && PATH="$(PATH_WITH_DEPOT)" $(ROOT)/depot/autoninja -C out/Default

publish: cleanup devtools-frontend/out/Default/gen/front_end
	npx wrangler pages deploy --project-name cloudflare-devtools devtools-frontend/out/Default/gen/front_end

cleanup:
	rm -rf devtools-frontend .gclient* .cipd node_modules depot

test:
	git -C devtools-frontend am $(PATCHES)

dev:
	cd devtools-frontend && PATH="$(PATH_WITH_DEPOT)" npm run install-deps
	cd devtools-frontend && PATH="$(PATH_WITH_DEPOT)" gn gen out/Default --args="devtools_skip_typecheck=true"
	cd devtools-frontend && PATH="$(PATH_WITH_DEPOT)" npm run watch
