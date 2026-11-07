# Possible Minds Lab 1.0

A mobile-friendly, local-first research prototype for controlled experiments on AI learning, memory, self-modelling and questions relevant to possible awareness.

## Run locally

Requires Node.js 18 or later. From this folder:

```bash
npm start
```

Open `http://localhost:3000` in a browser.

## Run the included checks

```bash
node --test tests.js
node --check app.js
node --check server.js
```

## What works in 1.0

- Four starter experiment designs.
- Approval queue: a test must be explicitly approved before the offline simulator runs.
- Offline deterministic simulator to test app workflow without API charges.
- Append-only-in-interface trial ledger with raw prompt/output, timestamp, mode, confidence and human scoring.
- Model-specific local memory notes.
- JSON export/import backup.
- Provider status endpoint and secure server-side API-key configuration foundation. Live model execution is deliberately disabled in this release so no call can bypass the approval workflow.
- Mobile responsive layout.

## Important limits

- The offline simulator is **not an AI model**. Its output is labelled as simulated and must never be cited as a real model result.
- The app does not yet inject saved notes into provider prompts, conduct delayed recall across separate sessions automatically, or provide a cryptographically tamper-proof ledger.
- Provider adapters are not active in this release. No live provider calls can be made. The provider connection stage must be implemented behind the approval queue before any API key is added.
- API calls may incur charges depending on provider account and plan. Offline mode does not call external APIs.
- Browser local storage can be cleared by the browser or device. Export backups.
- Natural-language explanations and confidence reports are observable outputs, not direct access to hidden internal reasoning or proof of subjective experience.

## Research integrity roadmap

1. Add actual provider runs behind the same approval gate.
2. Record exact provider/model/version, parameters, timestamps and raw outputs.
3. Add fixed scoring rubrics and held-out variants.
4. Add separate per-model memory stores and controlled recall trials.
5. Add append-only, hash-chained event records and backup verification.
6. Add repeated-trial statistics and calibration plots.

## Security

Never put API keys in `app.js`, `index.html`, screenshots, or chat messages. Use private environment variables on the host. Do not deploy this prototype publicly until authentication, rate limits, abuse protection, and data backup policies are added.


## Version 1.1 — Blind Rule Challenge
Open `/blind-test.html` after starting the server. The server selects a hidden rule, generates training observations and holds the test answer server-side. Submit a prediction and confidence before the reveal. Trial state is in server memory only and is lost on restart. The task uses a small rule library and is a toy benchmark, not proof of understanding or awareness. It is not yet wired to call the three AI providers; copy the observations and test prompt to each provider separately for manual comparison.
