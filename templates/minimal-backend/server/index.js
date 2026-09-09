import { readFileSync } from "node:fs";
import { createRpc } from "./lib/rpc.js";
import { createHostApi } from "./lib/host-api.js";
import { createReviewRecord, parseReviewInput } from "./lib/core.js";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const PLUGIN_ID = manifest.pluginId;
const PLUGIN_VERSION = manifest.version;
const RPC_PROTOCOL = "narrafork.rpc/1";

let initialized = false;
let active = false;
let runtimeId;
let generation;

const rpc = createRpc({ onRequest: handleRequest });
const host = createHostApi(rpc);

function jsonRpcError(code, message, data) {
  return { error: { code, message, ...(data === undefined ? {} : { data }) } };
}

async function handleRequest(message) {
  switch (message.method) {
    case "initialize": {
      const params = message.params;
      if (!params || params.protocol !== RPC_PROTOCOL || params.pluginId !== PLUGIN_ID) {
        return jsonRpcError(-32602, "initialize identity or protocol mismatch");
      }
      runtimeId = typeof params.runtimeId === "string" ? params.runtimeId : undefined;
      generation = typeof params.generation === "number" ? params.generation : undefined;
      initialized = true;
      return { result: { initialized: true, protocol: RPC_PROTOCOL } };
    }
    case "activate":
      if (!initialized) return jsonRpcError(-32603, "plugin must be initialized before activation");
      active = true;
      return { result: { activated: true } };
    case "health":
      return { result: { healthy: initialized && active, runtimeId, generation } };
    case "deactivate":
      active = false;
      return { result: { deactivated: true } };
    case "shutdown":
      active = false;
      initialized = false;
      setImmediate(() => process.exit(0));
      return { result: { shutdown: true } };
    case "review.create":
      return createReviewCommand(message.params);
    default:
      return jsonRpcError(-32601, `method not found: ${message.method}`);
  }
}

async function createReviewCommand(input) {
  const parsed = parseReviewInput(input);
  if (!parsed.ok) return jsonRpcError(-32602, parsed.reason);

  const review = createReviewRecord(parsed.value);
  await host.storageSet(`review:${review.value.chapterId}`, review.value);
  return { status: "succeeded", data: review.value };
}

process.stdin.on("data", (chunk) => {
  try {
    rpc.onData(chunk);
  } catch (error) {
    process.stderr.write(`[plugin-rpc-error] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
});
process.stdin.on("end", () => rpc.onEnd());

rpc.notify("hello", {
  pluginId: PLUGIN_ID,
  version: PLUGIN_VERSION,
  rpcProtocol: RPC_PROTOCOL,
  features: manifest.engine.features ?? [],
  sdk: { name: "narrafork-plugin-template", version: "0.1.0" },
});
