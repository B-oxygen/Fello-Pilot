import type { Page } from "@playwright/test";

const SIGN_SERVER_BASE =
  process.env.SIGN_SERVER_BASE ?? "http://localhost:3098";

export async function installWalletMock(page: Page) {
  const resAddr = await fetch(`${SIGN_SERVER_BASE}/address`);
  const { address } = (await resAddr.json()) as { address: string };

  await page.addInitScript(
    ({ address, signBase }) => {
      const log = (...args: unknown[]) =>
        console.log("[wallet-mock]", ...args);

      type Listener = (..._args: unknown[]) => void;
      const listeners = new Map<string, Set<Listener>>();
      const sepoliaChainHex = "0xaa36a7";
      let connected = false;

      async function relay(method: string, params: unknown[]) {
        const r = await fetch(`${signBase}/`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method, params }),
        });
        const j = (await r.json()) as { sig?: string; error?: string };
        if (j.sig) return j.sig;
        throw new Error(j.error ?? "sign-server returned no signature");
      }

      const provider = {
        isMetaMask: true,
        chainId: sepoliaChainHex,
        selectedAddress: address,
        request: async ({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) => {
          log("request:", method, "(connected=", connected, ")");
          switch (method) {
            case "eth_requestAccounts":
              connected = true;
              return [address];
            case "eth_accounts":
              return connected ? [address] : [];
            case "eth_chainId":
            case "net_version":
              return method === "net_version"
                ? String(parseInt(sepoliaChainHex, 16))
                : sepoliaChainHex;
            case "wallet_switchEthereumChain":
              return null;
            case "wallet_getPermissions":
            case "wallet_requestPermissions":
              return [{ parentCapability: "eth_accounts" }];
            case "eth_signTypedData_v4":
            case "personal_sign":
              if (!connected)
                throw new Error("Wallet not connected (mock)");
              return await relay(method, params ?? []);
            default:
              return null;
          }
        },
        on: (event: string, cb: Listener) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(cb);
        },
        removeListener: (event: string, cb: Listener) => {
          listeners.get(event)?.delete(cb);
        },
      };
      (globalThis as unknown as { ethereum: typeof provider }).ethereum =
        provider;
      (
        globalThis as unknown as { __WALLET_MOCK_ADDRESS__: string }
      ).__WALLET_MOCK_ADDRESS__ = address;

      const announceDetail = Object.freeze({
        info: Object.freeze({
          uuid: "test-mock-eip6963-uuid",
          name: "FelloPilot Test Mock",
          icon:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          rdns: "fellopilot.test.mock",
        }),
        provider,
      });
      const announce = () => {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", { detail: announceDetail }),
        );
      };
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { address, signBase: SIGN_SERVER_BASE },
  );

  return address;
}
