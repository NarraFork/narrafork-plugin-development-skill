import { describe, expect, test } from "bun:test";
import { createHostApi, HostApiError } from "../minimal-backend/server/lib/host-api.js";
import { createRpc } from "../minimal-backend/server/lib/rpc.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeFrame(message: object) {
  const body = JSON.stringify(message);
  return encoder.encode(`Content-Length: ${encoder.encode(body).byteLength}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${body}`);
}

function join(chunks: Uint8Array[]) {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decoder.decode(bytes);
}

describe("Content-Length RPC", () => {
  test("uses UTF-8 byte length and accepts split frames", async () => {
    const output: Uint8Array[] = [];
    const rpc = createRpc({
      write: (frame) => output.push(new Uint8Array(frame)),
      onRequest: () => ({ greeting: "你好🙂" }),
    });
    const input = encodeFrame({ jsonrpc: "2.0", id: 1, method: "echo" });
    rpc.onData(input.slice(0, 7));
    rpc.onData(input.slice(7));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const wire = join(output);
    const separator = wire.indexOf("\r\n\r\n");
    const body = wire.slice(separator + 4);
    const declared = Number(wire.slice("Content-Length: ".length, wire.indexOf("\r\n")));
    expect(declared).toBe(encoder.encode(body).byteLength);
    expect(JSON.parse(body)).toEqual({ jsonrpc: "2.0", id: 1, result: { greeting: "你好🙂" } });
  });

  test("returns a dispatcher error for an unknown method", async () => {
    const output: Uint8Array[] = [];
    const rpc = createRpc({
      write: (frame) => output.push(new Uint8Array(frame)),
      onRequest: () => ({ error: { code: -32601, message: "method not found" } }),
    });
    rpc.onData(encodeFrame({ jsonrpc: "2.0", id: 2, method: "unknown" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(join(output)).toContain('"code":-32601');
  });
});

describe("Host API helper", () => {
  test("unwraps storage entry values and passes command concurrency fields", async () => {
    const calls: Array<{ method: string; params: unknown; options: unknown }> = [];
    const fakeRpc = {
      request: async (method: string, params: unknown, options: unknown) => {
        calls.push({ method, params, options });
        if (method === "storage.get") return { key: "review:1", value: { ok: true }, revision: 3 };
        return { status: "succeeded", data: { accepted: true } };
      },
    };
    const host = createHostApi(fakeRpc, { timeoutMs: 1234 });

    expect(await host.storageGet("review:1")).toEqual({ ok: true });
    expect(await host.executeCommand("review.create", { chapterId: "1" }, {
      idempotencyKey: "request-1",
      expectedVersion: 3,
    })).toEqual({ status: "succeeded", data: { accepted: true } });
    expect(calls[0]).toMatchObject({ method: "storage.get", options: { timeoutMs: 1234 } });
    expect(calls[1]).toMatchObject({
      method: "commands.execute",
      params: {
        commandId: "review.create",
        input: { chapterId: "1" },
        idempotencyKey: "request-1",
        expectedVersion: 3,
      },
    });
  });

  test("maps failed host envelopes to HostApiError", async () => {
    const host = createHostApi({
      request: async () => ({ status: "failed", error: { code: "CONFLICT", message: "stale" } }),
    });
    await expect(host.executeQuery("chapters.read", { id: "1" })).rejects.toBeInstanceOf(HostApiError);
    await expect(host.executeQuery("chapters.read", { id: "1" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
