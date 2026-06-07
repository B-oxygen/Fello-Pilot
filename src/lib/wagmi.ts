import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export function getConfig() {
  return createConfig({
    chains: [sepolia],
    connectors: [injected()],
    multiInjectedProviderDiscovery: true,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [sepolia.id]: http(),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
