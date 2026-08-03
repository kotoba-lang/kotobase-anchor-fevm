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

```sh
clojure -M:test
clojure -M:lint
```

