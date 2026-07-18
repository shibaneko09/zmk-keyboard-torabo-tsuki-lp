import { app, BrowserWindow, dialog, Menu, session } from "electron";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkSerialPermission,
  isAllowedSerialOrigin,
  serialPortLabel,
} from "./serial-policy.mjs";

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const rendererPath = join(runtimeDirectory, "renderer", "index.html");
let mainWindow;
let serialSessionConfigured = false;

function configureSerialAccess(electronSession) {
  if (serialSessionConfigured) return;
  serialSessionConfigured = true;

  electronSession.setPermissionCheckHandler(checkSerialPermission);

  electronSession.setDevicePermissionHandler((details) =>
    details.deviceType === "serial" && isAllowedSerialOrigin(details.origin),
  );

  electronSession.on("select-serial-port", async (event, portList, _webContents, callback) => {
    event.preventDefault();
    let finished = false;
    const finish = (portId = "") => {
      if (finished) return;
      finished = true;
      callback(portId);
    };

    if (!portList.length) {
      finish();
      return;
    }

    const deviceButtons = portList.map(serialPortLabel);
    const cancelId = deviceButtons.length;

    try {
      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "USBデバイスを選択",
        message: "torabo-tsuki LPのCentral側を選択してください",
        detail: "選択したデバイスだけに、このアプリの実行中シリアル接続を許可します。",
        buttons: [...deviceButtons, "キャンセル"],
        defaultId: 0,
        cancelId,
        noLink: true,
      });
      finish(result.response < portList.length ? portList[result.response].portId : "");
    } catch {
      finish();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#f3f2ed",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    try {
      const target = new URL(targetUrl);
      if (target.protocol !== "file:") {
        event.preventDefault();
        return;
      }
      const targetPath = normalize(fileURLToPath(target));
      const allowedDirectory = `${normalize(dirname(rendererPath))}${sep}`;
      if (!targetPath.startsWith(allowedDirectory)) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = undefined; });
  void mainWindow.loadFile(rendererPath);
}

app.setName("Torabo Tsuki Studio");

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  configureSerialAccess(session.defaultSession);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
