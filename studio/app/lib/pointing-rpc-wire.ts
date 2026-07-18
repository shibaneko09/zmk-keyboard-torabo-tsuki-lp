import * as _m0 from "protobufjs/minimal";

/**
 * Field 6 is the first unused subsystem field in the v0.3 Studio envelope.
 */
export const POINTING_SUBSYSTEM_FIELD = 6;
export const CURSOR_SCALE_MIN_MILLI = 250;
export const CURSOR_SCALE_MAX_MILLI = 2000;
export const SCROLL_SCALE_MIN_MILLI = 100;
export const SCROLL_SCALE_MAX_MILLI = 2000;

export type PointingSettings = {
  cursorScaleMilli: number;
  scrollScaleMilli: number;
  invertScrollX: boolean;
  invertScrollY: boolean;
};

export type PointingSettingsResponse = {
  requestId: number;
  settings: PointingSettings;
};

export function validatePointingSettings(settings: PointingSettings) {
  return Number.isInteger(settings.cursorScaleMilli)
    && settings.cursorScaleMilli >= CURSOR_SCALE_MIN_MILLI
    && settings.cursorScaleMilli <= CURSOR_SCALE_MAX_MILLI
    && Number.isInteger(settings.scrollScaleMilli)
    && settings.scrollScaleMilli >= SCROLL_SCALE_MIN_MILLI
    && settings.scrollScaleMilli <= SCROLL_SCALE_MAX_MILLI;
}

function readSettings(reader: _m0.Reader, length: number): PointingSettings {
  const end = reader.pos + length;
  const settings: PointingSettings = {
    cursorScaleMilli: 0,
    scrollScaleMilli: 0,
    invertScrollX: false,
    invertScrollY: false,
  };

  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1:
        settings.cursorScaleMilli = reader.uint32();
        break;
      case 2:
        settings.scrollScaleMilli = reader.uint32();
        break;
      case 3:
        settings.invertScrollX = reader.bool();
        break;
      case 4:
        settings.invertScrollY = reader.bool();
        break;
      default:
        reader.skipType(tag & 7);
        break;
    }
  }

  return settings;
}

function writeSettings(writer: _m0.Writer, settings: PointingSettings) {
  writer.uint32(8).uint32(settings.cursorScaleMilli);
  writer.uint32(16).uint32(settings.scrollScaleMilli);
  if (settings.invertScrollX) writer.uint32(24).bool(true);
  if (settings.invertScrollY) writer.uint32(32).bool(true);
}

export function encodeGetPointingSettingsRequest(requestId: number) {
  const writer = _m0.Writer.create();
  writer.uint32(8).uint32(requestId);

  // zmk.studio.Request.pointing (field 6) containing
  // zmk.studio.PointingRequest.get_settings (field 1).
  const pointing = writer.uint32(POINTING_SUBSYSTEM_FIELD << 3 | 2).fork();
  pointing.uint32(8).bool(true);
  pointing.ldelim();

  return writer.finish();
}

export function encodeSetPointingSettingsRequest(requestId: number, settings: PointingSettings) {
  if (!validatePointingSettings(settings)) throw new Error("Pointing settings are out of range");

  const writer = _m0.Writer.create();
  writer.uint32(8).uint32(requestId);
  const pointing = writer.uint32(POINTING_SUBSYSTEM_FIELD << 3 | 2).fork();
  const settingsMessage = pointing.uint32(18).fork();
  writeSettings(settingsMessage, settings);
  settingsMessage.ldelim();
  pointing.ldelim();

  return writer.finish();
}

export function decodePointingSettingsResponse(
  bytes: Uint8Array,
  responseField = 1,
): PointingSettingsResponse {
  const reader = _m0.Reader.create(bytes);
  // request_id is a proto3 scalar, so firmware legitimately omits its default
  // value (zero) from the wire format.
  let requestId = 0;
  let settings: PointingSettings | undefined;

  while (reader.pos < reader.len) {
    const outerTag = reader.uint32();
    if (outerTag >>> 3 !== 1) {
      reader.skipType(outerTag & 7);
      continue;
    }

    const responseEnd = reader.pos + reader.uint32();
    while (reader.pos < responseEnd) {
      const responseTag = reader.uint32();
      switch (responseTag >>> 3) {
        case 1:
          requestId = reader.uint32();
          break;
        case POINTING_SUBSYSTEM_FIELD: {
          const pointingEnd = reader.pos + reader.uint32();
          while (reader.pos < pointingEnd) {
            const pointingTag = reader.uint32();
            if (pointingTag >>> 3 === responseField) {
              settings = readSettings(reader, reader.uint32());
            } else {
              reader.skipType(pointingTag & 7);
            }
          }
          break;
        }
        default:
          reader.skipType(responseTag & 7);
          break;
      }
    }
  }

  if (!settings) {
    throw new Error("Pointing settings response is incomplete");
  }

  return { requestId, settings };
}

/** Creates a firmware-shaped response for the wire-format unit test. */
export function encodePointingSettingsResponseForTest(
  requestId: number,
  settings: PointingSettings,
  responseField = 1,
) {
  const outer = _m0.Writer.create();
  const requestResponse = outer.uint32(10).fork();
  if (requestId !== 0) requestResponse.uint32(8).uint32(requestId);

  const pointing = requestResponse.uint32(POINTING_SUBSYSTEM_FIELD << 3 | 2).fork();
  const settingsMessage = pointing.uint32(responseField << 3 | 2).fork();
  writeSettings(settingsMessage, settings);
  settingsMessage.ldelim();
  pointing.ldelim();
  requestResponse.ldelim();

  return outer.finish();
}
