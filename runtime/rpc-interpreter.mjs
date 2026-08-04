import {Contract, JsonRpcProvider, Wallet, concat, getAddress, keccak256, toUtf8Bytes} from "ethers";

export const CALIBRATION = Object.freeze({
  chainId: 314159,
  rpcUrl: "https://api.calibration.node.glif.io/rpc/v1"
});

export const ANCHOR_ABI = [
  "function anchor(bytes32 idempotencyKey, bytes32 checkpointDigest) returns (bool)",
  "function receipts(bytes32) view returns (bytes32 checkpointDigest,uint64 anchoredAt)",
  "event CheckpointAnchored(bytes32 indexed idempotencyKey,bytes32 indexed checkpointDigest)"
];

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function effectType(effect) {
  return effect["effect/type"] ?? effect.effect_type ?? effect.type;
}

function requiredHex32(value, name) {
  if (!HEX32.test(value ?? "")) throw new Error(`${name} must be a 32-byte hex value`);
  return value;
}

export function privateAnchorMaterial(effect, disclosureSalt) {
  requiredHex32(disclosureSalt, "disclosure salt");
  const payload = effect.payload;
  if (!payload || !Number.isSafeInteger(payload.epoch) || payload.epoch < 0)
    throw new Error("submission effect requires a non-negative payload epoch");
  const privatePayload = canonical(payload);
  const checkpointDigest = keccak256(concat([disclosureSalt, toUtf8Bytes("kotobase/private-checkpoint/v1"),
    toUtf8Bytes(privatePayload)]));
  const idempotencyKey = keccak256(concat([disclosureSalt, toUtf8Bytes("kotobase/anchor-idempotency/v1"),
    toUtf8Bytes(String(effect.idempotency_key ?? effect["idempotency-key"] ?? ""))]));
  return {idempotencyKey, checkpointDigest};
}

export class FevmRpcInterpreter {
  constructor({provider, signer, contractAddress, disclosureSalt, minConfirmations = 20,
    maxGas = 2_000_000n, contractFactory = (address, abi, connectedSigner) =>
      new Contract(address, abi, connectedSigner)}) {
    if (!provider || !signer) throw new Error("FEVM interpreter requires provider and signer");
    this.provider = provider;
    this.signer = signer;
    this.contractAddress = getAddress(contractAddress);
    this.disclosureSalt = requiredHex32(disclosureSalt, "disclosure salt");
    this.minConfirmations = minConfirmations;
    this.maxGas = BigInt(maxGas);
    this.contractFactory = contractFactory;
  }

  async interpret(effect) {
    const type = effectType(effect);
    if (type === "fevm/submit-checkpoint" || type === ":fevm/submit-checkpoint")
      return this.submit(effect);
    if (type === "fevm/read-receipt" || type === ":fevm/read-receipt")
      return this.readReceipt(effect);
    throw new Error(`unsupported FEVM effect ${type}`);
  }

  async submit(effect) {
    const material = privateAnchorMaterial(effect, this.disclosureSalt);
    const contract = this.contractFactory(this.contractAddress, ANCHOR_ABI, this.signer);
    const estimate = await contract.anchor.estimateGas(material.idempotencyKey,
      material.checkpointDigest);
    if (estimate > this.maxGas) return {"result/type": "failed", reason: "gas-budget-exceeded"};
    const options = {gasLimit: estimate * 12n / 10n};
    // JSON-RPC providers may cache transaction counts across a reorg. Read the
    // pending nonce directly so an idempotent replacement uses canonical chain
    // state instead of a stale provider cache.
    if (this.signer.address && typeof this.provider.send === "function") {
      const pending = await this.provider.send("eth_getTransactionCount", [this.signer.address, "pending"]);
      options.nonce = Number(BigInt(pending));
    }
    const transaction = await contract.anchor(material.idempotencyKey,
      material.checkpointDigest, options);
    return {"result/type": "submitted", "tx-hash": transaction.hash};
  }

  async readReceipt(effect) {
    const transactionHash = effect.transaction_hash ?? effect["transaction-hash"];
    const expectedBlockHash = effect.expected_block_hash ?? effect["expected-block-hash"];
    const receipt = await this.provider.getTransactionReceipt(transactionHash);
    if (!receipt) return expectedBlockHash
      ? {"result/type": "reorged"}
      : {"result/type": "not-final"};
    if (receipt.status !== 1) return {"result/type": "failed", reason: "transaction-reverted"};
    if (expectedBlockHash && receipt.blockHash.toLowerCase() !== expectedBlockHash.toLowerCase())
      return {"result/type": "reorged"};
    if (!expectedBlockHash)
      return {"result/type": "confirmed", height: receipt.blockNumber, "block-hash": receipt.blockHash};
    const head = await this.provider.getBlockNumber();
    const confirmations = Math.max(0, head - receipt.blockNumber + 1);
    return confirmations >= this.minConfirmations
      ? {"result/type": "finalized", confirmations}
      : {"result/type": "not-final"};
  }
}

export async function calibrationInterpreterFromEnv(env = process.env) {
  if (!env.FEVM_PRIVATE_KEY || !env.FEVM_CONTRACT_ADDRESS || !env.FEVM_DISCLOSURE_SALT)
    throw new Error("FEVM_PRIVATE_KEY, FEVM_CONTRACT_ADDRESS and FEVM_DISCLOSURE_SALT are required");
  const provider = new JsonRpcProvider(env.FEVM_RPC_URL ?? CALIBRATION.rpcUrl,
    {chainId: CALIBRATION.chainId, name: "filecoin-calibration"}, {staticNetwork: true});
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CALIBRATION.chainId) throw new Error("refusing non-Calibration chain");
  return new FevmRpcInterpreter({provider, signer: new Wallet(env.FEVM_PRIVATE_KEY, provider),
    contractAddress: env.FEVM_CONTRACT_ADDRESS, disclosureSalt: env.FEVM_DISCLOSURE_SALT,
    minConfirmations: Number(env.FEVM_MIN_CONFIRMATIONS ?? 20),
    maxGas: BigInt(env.FEVM_MAX_GAS ?? 2_000_000)});
}
