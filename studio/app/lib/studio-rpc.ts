import { get_decoder, get_encoder } from "@zmkfirmware/zmk-studio-ts-client/framing";
import { Request, Response } from "@zmkfirmware/zmk-studio-ts-client/studio";
import type { RequestResponse } from "@zmkfirmware/zmk-studio-ts-client/studio";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import {
  decodePointingSettingsResponse,
  encodeGetPointingSettingsRequest,
  encodeSetPointingSettingsRequest,
} from "./pointing-rpc-wire";
import type { PointingSettings } from "./pointing-rpc-wire";

type RpcRequest = Omit<Request, "requestId">;

export class StudioRpcError extends Error {
  constructor(message: string, readonly condition?: number) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PointingRpcUnsupportedError extends StudioRpcError {}

const RPC_RESPONSE_TIMEOUT_MS = 10_000;

class AsyncQueue {
  private tail = Promise.resolve();

  async run<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = () => {};
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }
}

function metaError(response: RequestResponse | undefined) {
  const condition = response?.meta?.simpleError;
  if (condition === undefined && !response?.meta?.noResponse) return undefined;
  if (condition === 1) return new StudioRpcError("キーボード側でStudio unlockが必要です。", condition);
  if (condition === 2) return new PointingRpcUnsupportedError("このファームウェアはポインター設定に対応していません。", condition);
  if (response?.meta?.noResponse) return new StudioRpcError("RPCの応答がありませんでした。");
  return new StudioRpcError(`Studio RPCエラー (${condition})`, condition);
}

export class ToraboStudioRpcConnection {
  private readonly requestWritable: WritableStream<Uint8Array>;
  private readonly responseReadable: ReadableStream<Uint8Array>;
  private readonly pipelineAbortController = new AbortController();
  private readonly requestPipe: Promise<void>;
  private readonly queue = new AsyncQueue();
  private requestId = 0;
  private closed = false;

  constructor(
    private readonly transport: RpcTransport,
    private readonly responseTimeoutMs = RPC_RESPONSE_TIMEOUT_MS,
  ) {
    const requestBytes = new TransformStream<Uint8Array, Uint8Array>();
    this.requestWritable = requestBytes.writable;
    this.requestPipe = requestBytes.readable
      .pipeThrough(new TransformStream(get_encoder()), { signal: this.pipelineAbortController.signal })
      .pipeTo(transport.writable, {
        signal: this.pipelineAbortController.signal,
        preventAbort: true,
      })
      .catch(() => {});

    this.responseReadable = transport.readable.pipeThrough(
      new TransformStream(get_decoder()),
      {
        signal: this.pipelineAbortController.signal,
        preventCancel: true,
      },
    );
  }

  call(request: RpcRequest): Promise<RequestResponse> {
    return this.queue.run(async () => {
      const requestId = this.requestId++;
      const bytes = Request.encode({ ...request, requestId }).finish();
      const frame = await this.transact(bytes, requestId);
      const decoded = Response.decode(frame).requestResponse;
      const error = metaError(decoded);
      if (error) throw error;
      if (!decoded) throw new StudioRpcError("Studio RPCの応答を解釈できませんでした。");
      return decoded;
    });
  }

  getPointingSettings(): Promise<PointingSettings> {
    return this.callPointing((requestId) => encodeGetPointingSettingsRequest(requestId), 1);
  }

  setPointingSettings(settings: PointingSettings): Promise<PointingSettings> {
    return this.callPointing(
      (requestId) => encodeSetPointingSettingsRequest(requestId, settings),
      2,
    );
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.pipelineAbortController.abort();
    await Promise.allSettled([this.requestPipe, this.responseReadable.cancel()]);
    this.transport.abortController.abort();
  }

  private callPointing(
    encode: (requestId: number) => Uint8Array,
    responseField: number,
  ): Promise<PointingSettings> {
    return this.queue.run(async () => {
      const requestId = this.requestId++;
      const frame = await this.transact(encode(requestId), requestId, (candidate) => {
        const legacyResponse = Response.decode(candidate).requestResponse;
        if (legacyResponse?.meta?.noResponse || legacyResponse?.meta?.simpleError !== undefined) {
          return true;
        }
        try {
          return decodePointingSettingsResponse(candidate, responseField).requestId === 0;
        } catch {
          return false;
        }
      });
      const stockResponse = Response.decode(frame).requestResponse;
      if (stockResponse?.meta?.noResponse) {
        throw new PointingRpcUnsupportedError("このファームウェアはポインター設定に対応していません。", 2);
      }
      const error = metaError(stockResponse);
      if (error) throw error;
      return decodePointingSettingsResponse(frame, responseField).settings;
    });
  }

  private async transact(
    bytes: Uint8Array,
    requestId: number,
    acceptsLegacyResponse?: (frame: Uint8Array) => boolean,
  ) {
    const writer = this.requestWritable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }

    const reader = this.responseReadable.getReader();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      while (true) {
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new StudioRpcError("Studio RPCの応答がタイムアウトしました。USB接続をやり直してください。")),
              this.responseTimeoutMs,
            );
          }),
        ]);
        clearTimeout(timeout);
        timeout = undefined;
        if (done || !value) throw new StudioRpcError("Studio RPC接続が終了しました。");

        const response = Response.decode(value);
        if (response.notification) continue;
        const responseId = response.requestResponse?.requestId;
        if (responseId !== requestId) {
          // Early pointing firmware omitted request_id, which proto3 decodes as
          // zero. Accept it only when the expected pointing payload validates.
          if (responseId === 0 && acceptsLegacyResponse?.(value)) return value;
          // A stale frame can be left in the serial stream after reconnecting.
          // Keep looking, but the read timeout above prevents an endless wait.
          continue;
        }
        return value;
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {});
      throw error;
    } finally {
      clearTimeout(timeout);
      reader.releaseLock();
    }
  }
}
