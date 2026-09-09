const MAX_HEADER_BYTES = 8 * 1024;
const MAX_FRAME_BYTES = 1 * 1024 * 1024;
const MAX_BUFFER_BYTES = MAX_HEADER_BYTES + MAX_FRAME_BYTES + 4;
const DEFAULT_TIMEOUT_MS = 30_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
let nextRequestId = 1;

function appendBytes(left, right) {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left);
  result.set(right, left.byteLength);
  return result;
}

function delimiterIndex(bytes) {
  for (let index = 0; index <= bytes.byteLength - 4; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) {
      return index;
    }
  }
  return -1;
}

function readContentLength(header) {
  let length;
  for (const line of header.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("invalid RPC header");
    if (line.slice(0, separator).trim().toLowerCase() !== "content-length") continue;
    if (length !== undefined) throw new Error("duplicate Content-Length header");
    const value = line.slice(separator + 1).trim();
    if (!/^\d+$/.test(value)) throw new Error("invalid Content-Length header");
    length = Number(value);
  }
  if (!Number.isSafeInteger(length)) throw new Error("missing Content-Length header");
  return length;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeError(error) {
  const result = new Error(error instanceof Error ? error.message : String(error));
  result.code = isObject(error) && error.code !== undefined ? error.code : -32603;
  result.data = isObject(error) ? error.data : undefined;
  return result;
}

export function createRpc({ onRequest, onNotification, onSend, write = (frame) => process.stdout.write(frame) } = {}) {
  let buffer = new Uint8Array(0);
  let ended = false;
  const pending = new Map();

  function send(message) {
    if (ended) throw new Error("RPC stream ended");
    const body = encoder.encode(JSON.stringify(message));
    if (body.byteLength > MAX_FRAME_BYTES) throw new Error("RPC frame exceeds limit");
    const header = encoder.encode(
      `Content-Length: ${body.byteLength}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`,
    );
    write(appendBytes(header, body));
    onSend?.(message);
  }

  function notify(method, params) {
    send({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) });
  }

  function request(method, params, options = {}) {
    const id = `p${nextRequestId++}`;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const signal = options.signal;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        pending.delete(id);
        callback(value);
      };
      const cancel = (code, message) => {
        try {
          if (!ended) notify("$/cancelRequest", { id });
        } finally {
          finish(reject, Object.assign(new Error(message), { code }));
        }
      };
      const onAbort = () => cancel("CANCELLED", `RPC request cancelled: ${method}`);
      const timer = setTimeout(() => cancel("TIMEOUT", `RPC request timed out: ${method}`), timeoutMs);
      pending.set(id, {
        resolve: (value) => finish(resolve, value),
        reject: (error) => finish(reject, error),
        timer,
      });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        send({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async function handle(message) {
    if (!isObject(message) || message.jsonrpc !== "2.0") return;
    if ("id" in message && typeof message.method === "string") {
      if (!onRequest) return;
      try {
        const result = await onRequest(message);
        const response = result && ("result" in result || "error" in result) ? result : { result };
        send({ jsonrpc: "2.0", id: message.id, ...response });
      } catch (error) {
        send({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
        });
      }
      return;
    }
    if (!("id" in message) && typeof message.method === "string") {
      onNotification?.(message);
      return;
    }
    if (!("id" in message)) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(normalizeError(message.error));
    else entry.resolve(message.result);
  }

  function parse() {
    while (buffer.byteLength > 0) {
      const delimiter = delimiterIndex(buffer);
      if (delimiter < 0) {
        if (buffer.byteLength > MAX_HEADER_BYTES) throw new Error("RPC header exceeds limit");
        return;
      }
      if (delimiter > MAX_HEADER_BYTES) throw new Error("RPC header exceeds limit");
      const length = readContentLength(decoder.decode(buffer.slice(0, delimiter)));
      if (length > MAX_FRAME_BYTES) throw new Error("RPC frame exceeds limit");
      const start = delimiter + 4;
      const end = start + length;
      if (buffer.byteLength < end) return;
      const message = JSON.parse(decoder.decode(buffer.slice(start, end)));
      buffer = buffer.slice(end);
      void handle(message);
    }
  }

  function onData(chunk) {
    if (ended) return;
    buffer = appendBytes(buffer, new Uint8Array(chunk));
    if (buffer.byteLength > MAX_BUFFER_BYTES) throw new Error("RPC input buffer exceeds limit");
    parse();
  }

  function onEnd() {
    ended = true;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("RPC stream ended"));
    }
    pending.clear();
  }

  return { request, notify, onData, onEnd };
}
