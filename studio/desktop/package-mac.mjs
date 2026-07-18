import { packager } from "@electron/packager";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const desktopDirectory = dirname(fileURLToPath(import.meta.url));
const studioDirectory = dirname(desktopDirectory);
const execFileAsync = promisify(execFile);
const studioPackage = JSON.parse(await readFile(join(studioDirectory, "package.json"), "utf8"));
const electronVersion = studioPackage.devDependencies?.electron;
const bluetoothUsageDescription =
  "USBシリアルデバイスを検出するためにBluetoothデバイス情報へアクセスします。Bluetooth通信は使用しません。";

if (!electronVersion) {
  throw new Error("Electron version is missing from studio/package.json.");
}

const outputPaths = await packager({
  dir: join(desktopDirectory, "runtime"),
  name: "Torabo Tsuki Studio",
  platform: "darwin",
  arch: "arm64",
  electronVersion,
  out: join(desktopDirectory, "out"),
  overwrite: true,
  asar: true,
  appBundleId: "com.local.torabo-tsuki.studio",
  appCategoryType: "public.app-category.utilities",
  darwinDarkModeSupport: true,
  osxSign: {
    identity: "-",
    identityValidation: false,
  },
});

for (const outputPath of outputPaths) {
  const appPath = join(outputPath, "Torabo Tsuki Studio.app");
  const infoPlist = join(appPath, "Contents", "Info.plist");
  const unusedPermissionDescriptions = [
    "NSAudioCaptureUsageDescription",
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
  ];

  for (const key of unusedPermissionDescriptions) {
    try {
      await execFileAsync("plutil", ["-remove", key, infoPlist]);
    } catch {
      // Electron versions differ in their default Info.plist keys.
    }
  }

  for (const key of [
    "NSBluetoothAlwaysUsageDescription",
    "NSBluetoothPeripheralUsageDescription",
  ]) {
    await execFileAsync("plutil", [
      "-replace",
      key,
      "-string",
      bluetoothUsageDescription,
      infoPlist,
    ]);
    const { stdout } = await execFileAsync("plutil", ["-extract", key, "raw", infoPlist]);
    if (stdout.trim() !== bluetoothUsageDescription) {
      throw new Error(`Failed to configure ${key} in ${infoPlist}.`);
    }
  }

  await execFileAsync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
  await execFileAsync("codesign", ["--verify", "--deep", "--strict", appPath]);
  console.log(`Packaged app: ${appPath}`);
}
