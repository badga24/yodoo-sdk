# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`yodoo-sdk` (npm package `yodoo-sdk`, GitHub repo `badga24/yodoo-sdk`, formerly `npm_yodoo_app`) is a typed TypeScript client for the
Yodoo **LocaleApp** API (`ROLE_LOCALE_APP`, endpoints `locale/app/v2/**`) — see `README.md` for the
full method reference. Almost every method is read-only; the one exception is customer registration
via share-token (`registerCustomerFromToken`, added 2026-08-04) — see `docs/apis/apps/locale.md` §5
in the `yodoo_back` sibling repo for the backend contract this wraps.

## Workflow

At the **start of every session**, check for open backend API doc notifications:
`gh issue list --repo badga24/yodoo-sdk --label api-docs-sync --state open`.
These are opened by `yodoo_back` (sibling repo at `../../yodoo_back`) whenever it changes a doc under
`docs/apis/apps/*.md` that affects this SDK. Read each one, apply the relevant change here (update
the client method/types and the README's method table) if needed, then close it (`gh issue close
<number> --comment "..."`) — don't leave them open once reviewed.

## Commands

```bash
npm install
npm run build      # compile src/ -> dist/
npm test           # vitest
npm run typecheck
```
