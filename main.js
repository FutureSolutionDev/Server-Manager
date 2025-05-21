const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
} = require("electron");
const path = require("path");
const Config = require("./config");
const { loadConfig } = require("./Utils");
const ipcMainHandler = require("./IpcMain");
const IpcMainController = require("./IpcMain/Controller");
let mainWindow;
let tray = null;
const AppIcon = nativeImage.createFromPath(
  path.join(__dirname, Config.AppIcon)
);

function createWindow() {
  mainWindow = new BrowserWindow({
    title: Config.AppName,
    // resizable: false,
    // maximizable: false,
    icon: AppIcon,
    width: 1280,
    height: 800,
    roundedCorners: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      enableRemoteModule: true,
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  Minimizing();
  loadConfig();
  ipcMainHandler({ ipcMain: ipcMain });
  console.log("App is ready");
});
app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
    tray.destroy();
    process.exit(1);
  }
});
app.on("before-quit", () => {
  IpcMainController.ShutdownAllServers();
});

function Minimizing() {
  tray = new Tray(AppIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        mainWindow.show();
      },
    },
    {
      label: "Exit",
      click: () => {
        app.isQuiting = true;
        app.quit();
        tray.destroy();
        process.exit(1);
      },
    },
  ]);
  tray.setToolTip(Config.AppName);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}
