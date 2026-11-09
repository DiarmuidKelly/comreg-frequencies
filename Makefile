# The Irish Radio Spectrum — ComReg RFPI explorer
#
# Everything runs through npm under the bonnet; these targets are the shorthand.
# `make` on its own prints this list.

SHELL := /bin/bash
.DEFAULT_GOAL := help

NODE_MODULES := node_modules/.package-lock.json
DATA := public/data/spectrum.json
RAW := data/raw/content.json
PORT ?= 5173
# Set for a GitHub Pages project site, e.g. BASE_PATH=/comreg-frequencies/
BASE_PATH ?= /

.PHONY: help
help: ## Show this help
	@echo "The Irish Radio Spectrum — available targets:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  Variables: PORT=$(PORT)  BASE_PATH=$(BASE_PATH)"

# --- setup ----------------------------------------------------------------

$(NODE_MODULES): package.json package-lock.json
	npm install
	@touch $@

.PHONY: install
install: $(NODE_MODULES) ## Install dependencies

# --- data -----------------------------------------------------------------

.PHONY: fetch
fetch: $(NODE_MODULES) ## Re-scrape rfpi.comreg.ie into data/raw (a few minutes)
	node scripts/fetch-data.mjs

$(DATA): scripts/build-data.mjs $(RAW) data/raw/frequency-table.json
	node scripts/build-data.mjs

.PHONY: data
data: $(DATA) ## Rebuild public/data/spectrum.json from data/raw

.PHONY: refresh
refresh: fetch ## Re-scrape ComReg and rebuild the bundle
	node scripts/build-data.mjs

# --- develop --------------------------------------------------------------

.PHONY: dev
dev: install data ## Run the dev server on http://localhost:$(PORT)
	npm run dev -- --port $(PORT) --strictPort

.PHONY: open
open: ## Open the running dev server in a browser
	@xdg-open http://localhost:$(PORT) >/dev/null 2>&1 || open http://localhost:$(PORT)

.PHONY: typecheck
typecheck: install ## Type-check without emitting
	npx tsc -b --noEmit

.PHONY: check
check: typecheck ## Everything CI runs
	@echo "ok"

# --- build & deploy -------------------------------------------------------

.PHONY: build
build: install data ## Production build into dist/
	BASE_PATH=$(BASE_PATH) npm run build

.PHONY: preview
preview: build ## Serve the production build locally
	npm run preview -- --port $(PORT) --strictPort

# main is protected: it takes pull requests only, so this opens one rather than
# pushing. Merging it is what triggers the GitHub Pages deploy.
.PHONY: pr
pr: check ## Open a PR for the current branch (main takes PRs only)
	gh pr create --fill --base main

.PHONY: deploy-cf
deploy-cf: build ## Publish dist/ to Cloudflare Pages (needs wrangler + auth)
	npx wrangler pages deploy dist --project-name comreg-frequencies

# --- housekeeping ---------------------------------------------------------

.PHONY: clean
clean: ## Remove build output and the generated data bundle
	rm -rf dist public/data

.PHONY: distclean
distclean: clean ## Also remove node_modules
	rm -rf node_modules
