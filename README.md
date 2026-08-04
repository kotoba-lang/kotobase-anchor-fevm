# kotobase-checkpoint-anchor-runtime

Asynchronous, chain-neutral checkpoint receipts for Kotobase.

The default capability is a signed append-only transparency log. It requires
no Filecoin account, blockchain, gas token, RPC service, IPFS, or physical
storage format. Receipts contain only salted opaque commitment values, a hash
chain and an Ed25519 signature. Database IDs, epochs, logical/physical roots,
graph CIDs and datoms do not cross the disclosure boundary.

`kotobase.anchor.checkpoint` owns the portable submission plan.
`runtime/checkpoint-material.mjs` owns private commitment derivation.
`runtime/transparency-anchor.mjs` is the standard chainless implementation.
`runtime/journal-store.mjs` supplies the fsync-backed durable CAS/receipt log.

Public-chain notarization is optional. `runtime/evm-interpreter.mjs` implements
standard EVM JSON-RPC, gas bounds, confirmations and block-hash reorg handling.
`profiles/filecoin-calibration.mjs` is one replaceable network profile; it is
not imported by the chainless path. The Solidity contract uses no Filecoin
precompile or PieceCID and can deploy on any compatible EVM.

The historical `kotobase.anchor.fevm` namespace and
`runtime/rpc-interpreter.mjs` remain compatibility facades. Neither default nor
optional runtime dependencies resolve `cloud-filecoin`.

No anchor is an `IEngine`, graph head, transaction acknowledgement, block
provider, or query dependency. Losing every anchor backend must not make the
graph database unavailable.

```sh
clojure -M:test
clojure -M:lint
npm ci
npm run test:cljs
npm run test:runtime
npm run test:contract
npm run qualify:transparency
```

See [`docs/CHECKPOINT_ANCHOR_RUNBOOK.md`](docs/CHECKPOINT_ANCHOR_RUNBOOK.md).
Filecoin Calibration remains an optional profile documented in
[`docs/FEVM_TESTNET_RUNBOOK.md`](docs/FEVM_TESTNET_RUNBOOK.md).
