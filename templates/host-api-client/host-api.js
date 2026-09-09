export class HostApiError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = "HostApiError";
    this.code = code;
    this.data = data;
  }
}

function toHostError(error) {
  if (error instanceof HostApiError) return error;
  return new HostApiError(
    typeof error?.code === "string" ? error.code : "INTERNAL_ERROR",
    error instanceof Error ? error.message : String(error),
    error?.data,
  );
}

function unwrap(result, methodId) {
  if (result && typeof result === "object" && result.status === "failed") {
    const code = typeof result.error?.code === "string" ? result.error.code : "INTERNAL_ERROR";
    const message = typeof result.error?.message === "string" ? result.error.message : `${methodId} failed`;
    throw new HostApiError(code, message, result.error);
  }
  return result;
}

export function createHostApi(rpc, { timeoutMs = 30_000 } = {}) {
  async function executeQuery(queryId, input) {
    try {
      return unwrap(
        await rpc.request("queries.execute", {
          queryId,
          ...(input === undefined ? {} : { input }),
        }, { timeoutMs }),
        queryId,
      );
    } catch (error) {
      throw toHostError(error);
    }
  }

  async function executeCommand(commandId, input, { idempotencyKey, expectedVersion } = {}) {
    try {
      return unwrap(
        await rpc.request("commands.execute", {
          commandId,
          ...(input === undefined ? {} : { input }),
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(expectedVersion === undefined ? {} : { expectedVersion }),
        }, { timeoutMs }),
        commandId,
      );
    } catch (error) {
      throw toHostError(error);
    }
  }

  const scope = { type: "global" };

  async function storageGet(key) {
    try {
      const entry = await rpc.request("storage.get", { scope, key }, { timeoutMs });
      return entry && typeof entry === "object" ? entry.value : entry;
    } catch (error) {
      throw toHostError(error);
    }
  }

  async function storageSet(key, value) {
    try {
      return await rpc.request("storage.set", { scope, key, value }, { timeoutMs });
    } catch (error) {
      throw toHostError(error);
    }
  }

  async function storageDelete(key) {
    try {
      return await rpc.request("storage.delete", { scope, key }, { timeoutMs });
    } catch (error) {
      throw toHostError(error);
    }
  }

  async function storageList(prefix, limit = 50) {
    try {
      return await rpc.request("storage.list", {
        scope,
        ...(prefix === undefined ? {} : { prefix }),
        limit,
      }, { timeoutMs });
    } catch (error) {
      throw toHostError(error);
    }
  }

  return { executeQuery, executeCommand, storageGet, storageSet, storageDelete, storageList };
}
