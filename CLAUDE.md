# ZKCVP

- Before writing or changing an integration test, read `docs/architecture.md` § Testing. The
  harness trades obvious code for round trips; every part of it looks removable until you know
  why it is there.
- `npm run test` — ~90s. Capture exit codes without a pipe (`npx vitest … | tail` returns
  tail's code and reports a failing run as passing). Never run two suites at once.
