import { createServer } from "node:http";
import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";

const PORT = Number(process.env.SIGN_SERVER_PORT ?? 3098);
const PK = process.env.TEST_PRIVATE_KEY ?? generatePrivateKey();
const account = privateKeyToAccount(PK);

console.log(`[sign-server] starting on :${PORT}`);
console.log(`[sign-server] test address: ${account.address}`);

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function send(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }
    if (req.method === "GET" && req.url === "/address") {
      return send(res, 200, { address: account.address });
    }
    if (req.method === "POST" && (req.url === "/" || req.url === "/sign")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const { method, params } = JSON.parse(body);
          console.log(
            `[sign-server] received method=${method} params.length=${params.length} typeof params[1]=${typeof params[1]}`,
          );
          if (method === "eth_signTypedData_v4") {
            const [, typedDataRaw] = params;
            const td =
              typeof typedDataRaw === "string"
                ? JSON.parse(typedDataRaw)
                : typedDataRaw;
            console.log(
              `[sign-server] td.domain=${JSON.stringify(td.domain)} chainIdType=${typeof td.domain?.chainId}`,
            );
            console.log(
              `[sign-server] td.types keys=${Object.keys(td.types ?? {}).join(",")}`,
            );
            console.log(`[sign-server] td.primaryType=${td.primaryType}`);
            console.log(
              `[sign-server] td.message=${JSON.stringify(td.message)} spendingCapType=${typeof td.message?.spendingCap} expiryType=${typeof td.message?.expiry}`,
            );
            // Normalize domain.chainId: viem stringifies BigInts to decimal
            // strings, so after JSON.parse the chainId arrives as a string
            // sometimes. viem.signTypedData expects number|bigint for
            // uint256, otherwise validateTypedData → numberToHex throws.
            // (Per Uniswap/interface createSignTypedData/viem.ts pattern.)
            const normalizedDomain = { ...td.domain };
            if (typeof normalizedDomain.chainId === "string") {
              normalizedDomain.chainId = BigInt(normalizedDomain.chainId);
            }
            const message = {
              approver: td.message.approver,
              action: td.message.action,
              tokenAllowlist: td.message.tokenAllowlist,
              spendingCap: BigInt(td.message.spendingCap),
              expiry: BigInt(td.message.expiry),
              proposalId: td.message.proposalId,
            };
            const sig = await account.signTypedData({
              domain: normalizedDomain,
              types: td.types,
              primaryType: td.primaryType,
              message,
            });
            console.log(`[sign-server] eth_signTypedData_v4 OK, sig.length=${sig.length}`);
            return send(res, 200, { sig });
          }
          if (method === "personal_sign") {
            const [text] = params;
            console.log(
              `[sign-server] personal_sign params[0]=${typeof text === "string" ? text.slice(0, 200) : typeof text}`,
            );
            const isHexBytes =
              typeof text === "string" && /^0x[0-9a-fA-F]*$/.test(text);
            const sig = await account.signMessage(
              isHexBytes
                ? { message: { raw: text } }
                : { message: text },
            );
            console.log(
              `[sign-server] personal_sign OK (hexBytes=${isHexBytes}), sig.length=${sig.length}`,
            );
            return send(res, 200, { sig });
          }
          return send(res, 400, { error: `unsupported method: ${method}` });
        } catch (err) {
          console.error(
            `[sign-server] ERROR:`,
            err?.message ?? String(err),
            "\nstack:",
            err?.stack,
          );
          return send(res, 500, { error: err.message ?? String(err) });
        }
      });
      return;
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: err.message ?? String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[sign-server] ready`);
});
