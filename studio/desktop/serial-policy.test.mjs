import assert from "node:assert/strict";
import test from "node:test";
import {
  checkSerialPermission,
  isAllowedSerialOrigin,
  serialPortLabel,
} from "./runtime/serial-policy.mjs";

test("allows Serial only for the packaged file origin", () => {
  assert.equal(isAllowedSerialOrigin("file://"), true);
  assert.equal(isAllowedSerialOrigin("file:///"), true);
  assert.equal(isAllowedSerialOrigin("https://example.com"), false);
});

test("checks Electron Serial permission against requestingOrigin", () => {
  const details = { isMainFrame: true, securityOrigin: undefined };

  assert.equal(checkSerialPermission(null, "serial", "file://", details), true);
  assert.equal(checkSerialPermission(null, "serial", "https://example.com", details), false);
  assert.equal(checkSerialPermission(null, "usb", "file://", details), false);
});

test("creates an identifiable native Serial device label", () => {
  assert.equal(
    serialPortLabel({ displayName: "ZMK Studio", vendorId: "7504", productId: "24832" }, 0),
    "ZMK Studio · VID 1D50 / PID 6100",
  );
  assert.equal(serialPortLabel({}, 1), "Serial device 2");
});
