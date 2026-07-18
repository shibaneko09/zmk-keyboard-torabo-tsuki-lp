export function isAllowedSerialOrigin(origin) {
  return origin === "file://" || origin === "file:///";
}

export function checkSerialPermission(_webContents, permission, requestingOrigin) {
  return permission === "serial" && isAllowedSerialOrigin(requestingOrigin);
}

function hexadecimalId(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toString(16).toUpperCase().padStart(4, "0");
}

export function serialPortLabel(port, index) {
  const name = port.displayName || port.portName || `Serial device ${index + 1}`;
  const vendorId = hexadecimalId(port.vendorId);
  const productId = hexadecimalId(port.productId);
  const ids = [vendorId ? `VID ${vendorId}` : null, productId ? `PID ${productId}` : null].filter(Boolean);
  return ids.length ? `${name} · ${ids.join(" / ")}` : name;
}
