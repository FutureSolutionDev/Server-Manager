const IpcMainController = require("./Controller");
const ipcMainHandler = ({ ipcMain }) => {
  ipcMain.handle("get-servers", IpcMainController.GetServers);
  ipcMain.on("create-server", IpcMainController.CreateServer);
  ipcMain.on("upload-buffer", IpcMainController.UploadBuffer);
  ipcMain.on("update-entry", IpcMainController.UpdateEntryFile);
  ipcMain.on("start-server", IpcMainController.StartServer);
  ipcMain.on("stop-server", IpcMainController.StopServer);
  ipcMain.on("restart-server", IpcMainController.RestartServer);
  ipcMain.on("delete-server", IpcMainController.DeleteServer);
  ipcMain.on("run-npm-install", IpcMainController.InstallNodeModules);
  ipcMain.on("load-log", IpcMainController.LoadServerLogs);
};
module.exports = ipcMainHandler;
