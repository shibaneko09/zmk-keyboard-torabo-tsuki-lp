import { get_decoder, get_encoder } from "@zmkfirmware/zmk-studio-ts-client/framing";
import { Response } from "@zmkfirmware/zmk-studio-ts-client/studio";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { describe, expect, it } from "vitest";
import {
  encodeGetPointingSettingsRequest,
  encodePointingSettingsResponseForTest,
  encodeSetPointingSettingsRequest,
} from "./pointing-rpc-wire";
import { PointingRpcUnsupportedError, ToraboStudioRpcConnection } from "./studio-rpc";

describe("ToraboStudioRpcConnection", () => {
  it("round-trips pointing get and set over the Studio serial framing", async () => {
    const clientToDevice = new TransformStream<Uint8Array, Uint8Array>();
    const deviceToClient = new TransformStream<Uint8Array, Uint8Array>();
    const responseFrames = new TransformStream<Uint8Array, Uint8Array>();
    const abortController = new AbortController();
    const transport: RpcTransport = {
      label: "test",
      abortController,
      writable: clientToDevice.writable,
      readable: deviceToClient.readable,
    };
    const decodedRequests = clientToDevice.readable.pipeThrough(new TransformStream(get_decoder()));
    void responseFrames.readable
      .pipeThrough(new TransformStream(get_encoder()))
      .pipeTo(deviceToClient.writable)
      .catch(() => {});

    const initial = {
      cursorScaleMilli: 1000,
      scrollScaleMilli: 333,
      invertScrollX: true,
      invertScrollY: false,
    };
    const updated = {
      cursorScaleMilli: 1500,
      scrollScaleMilli: 500,
      invertScrollX: false,
      invertScrollY: true,
    };

    const device = (async () => {
      const requestReader = decodedRequests.getReader();
      const responseWriter = responseFrames.writable.getWriter();
      try {
        const getRequest = await requestReader.read();
        expect(Array.from(getRequest.value ?? [])).toEqual(Array.from(encodeGetPointingSettingsRequest(0)));
        await responseWriter.write(encodePointingSettingsResponseForTest(99, initial));
        await responseWriter.write(encodePointingSettingsResponseForTest(0, initial));

        const setRequest = await requestReader.read();
        expect(Array.from(setRequest.value ?? [])).toEqual(Array.from(encodeSetPointingSettingsRequest(1, updated)));
        // Early pointing firmware omitted request_id, so a request after ID 0
        // came back as the proto3 default value. The validated payload remains usable.
        await responseWriter.write(encodePointingSettingsResponseForTest(0, updated, 2));

        const unsupportedRequest = await requestReader.read();
        expect(Array.from(unsupportedRequest.value ?? [])).toEqual(Array.from(encodeGetPointingSettingsRequest(2)));
        await responseWriter.write(Response.encode(Response.fromPartial({
          requestResponse: { requestId: 0, meta: { noResponse: true } },
        })).finish());
      } finally {
        requestReader.releaseLock();
        responseWriter.releaseLock();
      }
    })();

    const connection = new ToraboStudioRpcConnection(transport);
    expect(await connection.getPointingSettings()).toEqual(initial);
    expect(await connection.setPointingSettings(updated)).toEqual(updated);
    await expect(connection.getPointingSettings()).rejects.toBeInstanceOf(PointingRpcUnsupportedError);
    await device;
    await connection.close();
  });

  it("releases transport streams before the serial transport abort cleanup", async () => {
    const clientToDevice = new TransformStream<Uint8Array, Uint8Array>();
    const deviceToClient = new TransformStream<Uint8Array, Uint8Array>();
    const abortController = new AbortController();
    let transportCleanup: Promise<void> | undefined;
    abortController.signal.addEventListener("abort", () => {
      transportCleanup = Promise.all([
        clientToDevice.writable.close(),
        deviceToClient.readable.cancel(),
      ]).then(() => undefined);
    });

    const connection = new ToraboStudioRpcConnection({
      label: "test",
      abortController,
      writable: clientToDevice.writable,
      readable: deviceToClient.readable,
    });

    await connection.close();
    await expect(transportCleanup).resolves.toBeUndefined();
  });

  it("times out instead of waiting forever when the device stops responding", async () => {
    const clientToDevice = new TransformStream<Uint8Array, Uint8Array>();
    const deviceToClient = new TransformStream<Uint8Array, Uint8Array>();
    const requestReader = clientToDevice.readable
      .pipeThrough(new TransformStream(get_decoder()))
      .getReader();
    const connection = new ToraboStudioRpcConnection({
      label: "test",
      abortController: new AbortController(),
      writable: clientToDevice.writable,
      readable: deviceToClient.readable,
    }, 20);

    const response = connection.getPointingSettings();
    await expect(requestReader.read()).resolves.toMatchObject({ done: false });
    await expect(response).rejects.toThrow("Studio RPCの応答がタイムアウトしました");

    requestReader.releaseLock();
    await connection.close();
  });
});
