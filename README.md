# kotobase-anchor-fevm

Asynchronous FEVM anchoring adapter for Kotobase logical checkpoints.

This is deliberately not an `IEngine`, block provider, mutable database head or
query path. It creates a versioned public payload containing only database ID,
epoch, logical checkpoint root and optional Filecoin PieceCID. The engine's
provider-specific physical root is not put on chain.

No checkpoint-anchor contract is assumed to be deployed. `submission-plan`
returns an effect descriptor, and `call-message` accepts an explicitly supplied
contract address and calldata encoder. This prevents a placeholder ABI or
address from looking production-ready.

`kotobase.anchor.fevm.queue` adds the host-neutral durable coordinator. It
returns put-if-absent and compare-and-set persistence effects, leases due work,
rejects stale workers, applies only ordered lifecycle evidence, polls receipts,
and bounds retry with exponential backoff. A host must persist a claim CAS
before executing its network effect. The coordinator performs no I/O and is
never imported by the synchronous graph transaction path.

```sh
clojure -M:test
clojure -M:lint
npm ci
npm run test:cljs
```
