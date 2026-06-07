# FelloPilot Domain Stack (immutable)

Build rule for the FelloPilot product layer: reuse existing services, do not reinvent.

## Mandatory libraries

- **Wallet connection**: any wagmi-supported connector. Approved options: WalletConnect (`@walletconnect/*`) **or** EIP-6963 injected connector via `wagmi/connectors`. RainbowKit on top of wagmi is recommended for React but not required — a bare wagmi setup with the EIP-6963 injected connector is also compliant.
- **Chain interaction**: wagmi v2 (`wagmi`) + viem (`viem`). All reads/writes go through this layer.
- **CoinFello**: live testnet SDK call. Do not mock unless the endpoint is unreachable; in that case the response MUST be labeled `SIMULATION` (see `.omo/rules/boundary.md`).

## Forbidden alternatives

- ethers.js (v5 or v6) — wagmi/viem only.
- web3.js — wagmi/viem only.
- Hand-rolled wallet-connection code — use `wagmi/connectors` or the official `@walletconnect/*` SDK directly.
- Hardcoded RPC URLs — env only.
- Mainnet RPC — see `.omo/rules/ralphthon-mode.md`.

## Build conventions

- All chain reads/writes encapsulated under `src/lib/chain/` or `src/hooks/`. Components never call viem directly.
- A single wagmi config file (`src/lib/wagmi.ts` or equivalent) defines chains + transports + the connector list. Other modules import from there.
- Prefer the official wagmi / viem / WalletConnect recipe over hand-rolled code. A custom adapter is allowed ONLY when no recipe exists; isolate it under `src/lib/`.

## TBD (decide when `src/` lands)

- Framework: React vs Next.js (working assumption: Next.js App Router; revisit when product src lands).
- Testnet chain: Sepolia / Polygon Amoy / BSC testnet / other — depends on what CoinFello targets.
- CoinFello SDK package name and import path.
- Indexer / state management / auth (SIWE) / UI kit — not fixed at the harness layer.
