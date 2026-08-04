# kotobase-anchor-fevm

Asynchronous FEVM anchoring adapter for Kotobase logical checkpoints.

This is deliberately not an `IEngine`, block provider, mutable database head or
query path. Its local effect carries the versioned logical checkpoint input;
the RPC interpreter converts that input into an opaque, salted commitment.
Neither the logical input nor the engine's provider-specific physical root is
put on chain.

`contracts/src/KotobaseCheckpointAnchor.sol` is the testnet contract. It stores
only a salted opaque idempotency key and salted opaque checkpoint digest.
Database IDs, epochs, logical roots, physical roots and tenant data do
not cross the RPC boundary. Identical retries are no-ops; conflicting retries
revert.

`kotobase.anchor.fevm.queue` adds the host-neutral durable coordinator. It
returns put-if-absent and compare-and-set persistence effects, leases due work,
rejects stale workers, applies only ordered lifecycle evidence, polls receipts,
and bounds retry with exponential backoff. A host must persist a claim CAS
before executing its network effect. The coordinator performs no I/O and is
never imported by the synchronous graph transaction path.

`runtime/rpc-interpreter.mjs` is the effect interpreter for Filecoin
Calibration (chain ID `314159`). It checks gas before submission, records the
first receipt's block hash, waits for a configured confirmation floor, and
reports a reorg if the receipt disappears or moves to another block.
`runtime/journal-store.mjs` is a mode-`0600`, fsync-backed, SHA-256-framed
single-writer durable queue/receipt journal. It rejects revision-CAS conflicts
and fails closed on replay tampering. A horizontally scaled deployment must
replace it with a transactional CAS provider while retaining the same effects.

```sh
clojure -M:test
clojure -M:lint
npm ci
npm run test:cljs
npm run test:runtime
npm run test:contract
```

Deployment and evidence procedures are in
[`docs/FEVM_TESTNET_RUNBOOK.md`](docs/FEVM_TESTNET_RUNBOOK.md). No production
address or synchronous graph-backend dependency is defined here.
