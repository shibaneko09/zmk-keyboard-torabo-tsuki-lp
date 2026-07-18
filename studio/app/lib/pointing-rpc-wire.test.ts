import { describe, expect, it } from "vitest";
import { Request, Response } from "@zmkfirmware/zmk-studio-ts-client/studio";
import {
  decodePointingSettingsResponse,
  encodeGetPointingSettingsRequest,
  encodePointingSettingsResponseForTest,
  encodeSetPointingSettingsRequest,
} from "./pointing-rpc-wire";

describe("pointing Studio RPC wire spike", () => {
  it("encodes pointing as the unused Studio subsystem field 6", () => {
    const bytes = encodeGetPointingSettingsRequest(7);

    expect(Array.from(bytes)).toEqual([0x08, 0x07, 0x32, 0x02, 0x08, 0x01]);
  });

  it("remains safe for the stock v0.3 decoder, which skips field 6", () => {
    const decoded = Request.decode(encodeGetPointingSettingsRequest(7));

    expect(decoded).toEqual({
      requestId: 7,
      core: undefined,
      behaviors: undefined,
      keymap: undefined,
    });
  });

  it("round-trips a compact firmware-shaped settings response", () => {
    const settings = {
      cursorScaleMilli: 1000,
      scrollScaleMilli: 333,
      invertScrollX: true,
      invertScrollY: false,
    };
    const bytes = encodePointingSettingsResponseForTest(12, settings);

    expect(decodePointingSettingsResponse(bytes)).toEqual({ requestId: 12, settings });
    expect(bytes.length).toBeLessThanOrEqual(30);

    const stockDecoded = Response.decode(bytes);
    expect(stockDecoded.requestResponse?.requestId).toBe(12);
    expect(stockDecoded.requestResponse?.core).toBeUndefined();
    expect(stockDecoded.requestResponse?.keymap).toBeUndefined();
  });

  it("encodes and decodes the persisted setSettings RPC within the RX limit", () => {
    const settings = {
      cursorScaleMilli: 1250,
      scrollScaleMilli: 500,
      invertScrollX: false,
      invertScrollY: true,
    };
    const request = encodeSetPointingSettingsRequest(13, settings);
    const response = encodePointingSettingsResponseForTest(13, settings, 2);

    expect(request.length).toBeLessThanOrEqual(30);
    expect(decodePointingSettingsResponse(response, 2)).toEqual({ requestId: 13, settings });
  });

  it("rejects settings outside the firmware range", () => {
    expect(() => encodeSetPointingSettingsRequest(1, {
      cursorScaleMilli: 100,
      scrollScaleMilli: 333,
      invertScrollX: true,
      invertScrollY: false,
    })).toThrow("Pointing settings are out of range");
  });

  it("rejects a response without pointing settings", () => {
    expect(() => decodePointingSettingsResponse(Uint8Array.from([0x0a, 0x02, 0x08, 0x01])))
      .toThrow("Pointing settings response is incomplete");
  });
});
