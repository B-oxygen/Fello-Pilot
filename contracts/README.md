# FelloPilot DelegationManager — Sepolia deployment

UNAUDITED testnet-only ERC-7710-style delegation contract. See
`src/DelegationManager.sol` for the source.

## Deployment

| Field | Value |
|---|---|
| Network | Sepolia (chainId 11155111) |
| Address | `0xaD12fDC1fF472D54313Be5FCEc7b1D672B59e247` |
| Deploy tx | `0x41dbd4f0d654674642141a1e0ac3ad9c2f6fb250129eb99673383f6b0889edef` |
| Deployer | `0x9C561f634FaAca9335C94434Ad1096Aa66123527` (FelloPilot service signer) |
| Compiler | solc 0.8.26 + `via_ir = true` + optimizer 200 runs |
| First attestation tx | `0xccdc33b3c2704f623f12f43c754b212352b2da5a7b1ae675265b5e34bee79f35` |

The contract address is pinned in `src/lib/constants.ts` as
`DELEGATION_MANAGER_ADDRESS`. The deploy tx hash is pinned as
`DELEGATION_MANAGER_DEPLOY_TX`.

## Functions

### `attestIntent(intent, signature) -> bytes32 intentHash`

Records an EIP-712-signed DelegationIntent on-chain. Verifies the
signature was produced by `intent.approver` over the EIP-712 hash of the
struct under the contract's domain separator. Emits `DelegationAttested`.
Does NOT move tokens. This is the current FelloPilot contract-backed
attestation path for wallet-signed delegation intents.

This is the function the demo flow uses (via `src/lib/adapters/
directViem.ts`).

### `redeemDelegation(intent, token, amount, recipient, signature) -> bytes32 intentHash`

Verifies the signature, enforces token-allowlist + spending-cap + expiry
+ not-revoked, then pulls `amount` of `token` from `intent.approver` via
ERC-20 `transferFrom` to `recipient`. Updates `consumedAmount[intentHash]`.
Emits `DelegationRedeemed`. Requires the approver to have set an ERC-20
allowance for this contract.

This is the function a production redemption flow would use. Not
exercised by the demo (approver in the demo has no Sepolia USDC).

### `revoke(intent)`

Lets the approver mark a specific intent hash as revoked, after which
attestation and redemption both refuse.

## Honesty

The contract NatSpec marks itself UNAUDITED. The product UI surfaces a
`chat-message-contract-unaudited-notice` strip whenever a receipt comes
back with `contractAudited: false` (per operator decision).

The original PRD deferral for an onchain delegation contract is closed
with this Sepolia deployment.
