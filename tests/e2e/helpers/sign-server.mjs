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

function send(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/address") {
      return send(res, 200, { address: account.address });
    }
    if (req.method === "POST" && (req.url === "/" || req.url === "/sign")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const { method, params } = JSON.parse(body);
          if (method === "eth_signTypedData_v4") {
            const [, typedDataRaw] = params;
            const td =
              typeof typedDataRaw === "string"
                ? JSON.parse(typedDataRaw)
                : typedDataRaw;
            const message = {
              approver: td.message.approver,
              action: td.message.action,
              tokenAllowlist: td.message.tokenAllowlist,
              spendingCap: BigInt(td.message.spendingCap),
              expiry: BigInt(td.message.expiry),
              proposalId: td.message.proposalId,
            };
            const sig = await account.signTypedData({
              domain: td.domain,
              types: td.types,
              primaryType: td.primaryType,
              message,
            });
            return send(res, 200, { sig });
          }
          if (method === "personal_sign") {
            const [text] = params;
            const sig = await account.signMessage({ message: text });
            return send(res, 200, { sig });
          }
          return send(res, 400, { error: `unsupported method: ${method}` });
        } catch (err) {
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
