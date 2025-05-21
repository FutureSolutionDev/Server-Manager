const { spawn } = require("child_process");
const AdmZip = require("adm-zip");
const path = require("path");
const { app } = require("electron");
const fs = require("fs");
const {
  saveConfig,
  DeleteServer,
  loadConfig,
  FindServer,
  killPid,
  GetPidByPort,
  SafeMkdir,
} = require("../Utils");
const Config = require("../config");
const dirname = app.getPath("userData");
const SERVERS_PATH = path.join(dirname, "saved-servers");
let serverProcesses = {};
let serverStates = {};
class IpcMainController {
  static async RunNpmInstall(serverId, serverPath, event) {
    if (["installing", "running"].includes(serverStates[serverId])) {
      const msg = "NPM install already in progress.\n";
      IpcMainController.WriteLog(serverId, msg);
      event.sender.send("error", { serverId, message: msg });
      return;
    }

    serverStates[serverId] = "installing";
    const msg = "Running npm install...\n";
    IpcMainController.WriteLog(serverId, msg);
    event.sender.send("log-update", { serverId, message: msg });
    if (!fs.existsSync(serverPath)) {
      const errMsg = `Server path does not exist: ${serverPath}\n`;
      IpcMainController.WriteLog(serverId, errMsg);
      event.sender.send("error", { serverId, message: errMsg });
      serverStates[serverId] = "stopped";
      return;
    }
    return new Promise((resolve) => {
      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      const npmInstallProc = spawn(npmCmd, ["install"], {
        cwd: serverPath,
        shell: true,
      });
      serverProcesses[serverId] = npmInstallProc;
      npmInstallProc.stdout.on("data", (data) => {
        const msg = data.toString();
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
      });
      npmInstallProc.stderr.on("data", (data) => {
        const msg = "ERROR: " + data.toString();
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
      });
      npmInstallProc.on("close", (code) => {
        serverStates[serverId] = "stopped";
        serverProcesses[serverId] = null;
        const msg = `NPM install exited with code ${code}\n`;
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
        resolve(code); // allows StartServer to wait
      });
    });
  }
  static GetServerState(serverId) {
    return serverStates[serverId] || "unknown";
  }
  static WriteLog(serverId, message) {
    const logPath = path.join(dirname, "logs", `${serverId}.log`);
    if (!fs.existsSync(logPath)) {
      SafeMkdir(path.dirname(logPath), { recursive: true });
    }
    const OldLog = fs.existsSync(logPath)
      ? JSON.parse(fs.readFileSync(logPath, "utf8"))
      : [];
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      message,
    };
    OldLog.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(OldLog, null, 2));
  }
  static GetServers() {
    const GetData = loadConfig();
    return GetData;
  }
  static UpdateEntryFile(event, { serverId, entryFile }) {
    saveConfig(serverId, {
      entryFile,
    });
    const msg = `Entry file updated to ${entryFile}\n`;
    event.sender.send("log-update", { serverId, message: msg });
    IpcMainController.WriteLog(serverId, msg);
  }
  static UploadBuffer(event, { serverId, name, mime, buffer }) {
    try {
      const server = FindServer(serverId);
      const dest = server.path;
      const tempPath = path.join(dest, name);
      if (!fs.existsSync(dest)) {
        SafeMkdir(dest, { recursive: true });
      }
      fs.writeFileSync(tempPath, Buffer.from(buffer));

      if (name.endsWith(".zip")) {
        const zip = new AdmZip(tempPath);
        zip.extractAllTo(dest, true);
        fs.unlinkSync(tempPath);
      } else {
        event.sender.send("error", {
          serverId,
          message: "Uploaded file is not a ZIP file.",
        });
      }
      server.lastUpload = new Date().toISOString();
      saveConfig(serverId, {
        lastUpload: new Date().toISOString(),
      });
      event.sender.send("upload-complete", server);
    } catch (error) {
      console.error("Error uploading file:", error);
      event.sender.send("error", {
        serverId,
        message: "Error uploading file: " + error.message,
      });
    }
  }
  static CreateServer(event, name) {
    try {
      const id = Date.now().toString();
      const serverPath = path.join(SERVERS_PATH, id);
      console.log(serverPath);
      SafeMkdir(serverPath);
      const Created = saveConfig(id, {
        id,
        name,
        path: serverPath,
        entryFile: "",
        lastUpload: "",
        pid: null,
      });
      const msg = `Server created at ${serverPath}\n`;
      IpcMainController.WriteLog(id, msg);
      event.sender.send("log-update", { serverId: id, message: msg });
      event.sender.send("server-created", Created);
    } catch (error) {
      console.error("Error creating server:", error);
      event.sender.send("error", {
        message: "Error creating server: " + error.message,
      });
    }
  }
  static async StartServer(event, serverId) {
    try {
      const server = FindServer(serverId);
      if (!server) {
        event.sender.send("error", {
          serverId,
          message: "Server not found",
        });
        return;
      }
      if (serverProcesses[serverId]) return;
      if (!server.entryFile) {
        const msg = "Entry file not found. Please set an entry file.\n";
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
        return;
      }
      if (
        !Config.AllowedExtensions.includes(server.entryFile.split(".").pop())
      ) {
        const msg = `Start up File Is Not Allowed Please Make Sure That The File Is One Of The Allowed Extensions ${Config.AllowedExtensions.join(
          ", "
        )}\n`;
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
        return;
      }
      const IsHaveEntryFile = fs.existsSync(
        path.join(server.path, server.entryFile)
      );
      if (!IsHaveEntryFile) {
        const msg = "Entry file not found. Please upload an entry file.\n";
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("error", { serverId, message: msg });
        return;
      }
      const nodeModulesPath = path.join(server.path, "node_modules");
      const IsHaveNodeModules = fs.existsSync(nodeModulesPath);
      if (!IsHaveNodeModules) {
        const msg = "modules not found. Running npm install...\n";
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
        await IpcMainController.RunNpmInstall(serverId, server.path, event);
      }

      const startProcess = async () => {
        const proc = spawn("node", [server.entryFile], { cwd: server.path });
        serverProcesses[serverId] = proc;
        server.pid = proc.pid;
        saveConfig(serverId, {
          ...server,
          pid: proc.pid,
        });
        const msg = `Starting server with entry file: ${server.entryFile} (pid: ${proc.pid})\n`;
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
        proc.stdout.on("data", (data) => {
          serverStates[serverId] = "running";
          const msg = data.toString();
          IpcMainController.WriteLog(serverId, msg);
          event.sender.send("log-update", { serverId, message: msg });
        });

        proc.stderr.on("data", async (data) => {
          const errorMsg = data.toString();
          const portInUse = errorMsg.includes("EADDRINUSE");
          const msg = "ERROR: " + errorMsg;
          IpcMainController.WriteLog(serverId, msg);
          event.sender.send("log-update", { serverId, message: msg });
          if (portInUse) {
            const port = 4400; // Or dynamically extract from your entry file or config
            const pid = await GetPidByPort(port);
            if (pid) {
              const killed = killPid(pid);
              const killMsg = killed
                ? `Killed process ${pid} using port ${port}\n`
                : `Failed to kill process ${pid} using port ${port}\n`;
              IpcMainController.WriteLog(serverId, killMsg);
              event.sender.send("log-update", { serverId, message: killMsg });
              setTimeout(() => {
                IpcMainController.StartServer(event, serverId);
              }, 1000);
            } else {
              const warnMsg = `Port ${port} is in use but PID could not be determined.\n`;
              IpcMainController.WriteLog(serverId, warnMsg);
              event.sender.send("log-update", { serverId, message: warnMsg });
            }
          }
        });
        proc.on("close", (code) => {
          serverStates[serverId] = "stopped";
          const msg = `Server exited with code ${code}\n`;
          IpcMainController.WriteLog(serverId, msg);
          event.sender.send("log-update", { serverId, message: msg });
          delete serverProcesses[serverId];
          const updatedServer = FindServer(serverId);
          if (updatedServer?.pid) {
            delete updatedServer.pid;
            saveConfig(serverId, updatedServer);
          }
        });
      };
      await startProcess();
    } catch (error) {
      console.error("Error starting server:", error);
      event.sender.send("error", {
        serverId,
        message: "Error starting server: " + error.message,
      });
    }
  }
  static StopServer(event, serverId) {
    try {
      const currentState = serverStates[serverId];
      const proc = serverProcesses[serverId];
      if (proc) {
        const msg = `Killing server (${currentState || "unknown state"})...\n`;
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
        proc.kill();
        delete serverProcesses[serverId];
        serverStates[serverId] = "stopped";
        const stoppedMsg = `Server process ${serverId} killed.\n`;
        IpcMainController.WriteLog(serverId, stoppedMsg);
        event.sender.send("log-update", { serverId, message: stoppedMsg });
      } else {
        const msg = "Server is not running.\n";
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("error", { serverId, message: msg });
      }
    } catch (error) {
      console.error("Error stopping server:", error);
      event.sender.send("error", {
        serverId,
        message: "Error stopping server: " + error.message,
      });
    }
  }
  static async RestartServer(event, serverId) {
    try {
      const server = FindServer(serverId);
      if (!server) {
        event.sender.send("error", {
          serverId,
          message: "Server not found",
        });
        return;
      }
      if (serverProcesses[serverId]) {
        serverProcesses[serverId].kill();
        delete serverProcesses[serverId];
      } else {
        const msg = "Server is not running. Starting server...\n";
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("log-update", { serverId, message: msg });
      }
      await IpcMainController.StartServer(event, serverId);
    } catch (error) {
      console.error("Error restarting server:", error);
      event.sender.send("error", {
        serverId,
        message: "Error restarting server: " + error.message,
      });
    }
  }
  static DeleteServer(event, serverId) {
    try {
      if (serverProcesses[serverId]) {
        serverProcesses[serverId].kill();
        delete serverProcesses[serverId];
        delete serverStates[serverId];
      }
      DeleteServer(serverId);
      // Delete Logs
      const logPath = path.join(dirname, "logs", `${serverId}.log`);
      if (fs.existsSync(logPath)) {
        fs.unlinkSync(logPath);
      }
      event.sender.send("server-deleted", serverId);
    } catch (error) {
      console.error("Error deleting server:", error);
      event.sender.send("error", {
        serverId,
        message: "Error deleting server: " + error.message,
      });
    }
  }
  static InstallNodeModules(event, serverId) {
    try {
      const server = FindServer(serverId);
      if (!server) {
        event.sender.send("error", {
          serverId,
          message: "Server not found",
        });
        return;
      }
      const IsHaveEntryFile = fs.existsSync(
        path.join(server.path, server.entryFile)
      );
      if (!IsHaveEntryFile) {
        const msg = "Entry file not found. Please upload an entry file.\n";
        IpcMainController.WriteLog(serverId, msg);
        event.sender.send("error", { serverId, message: msg });
        return;
      }
      IpcMainController.RunNpmInstall(serverId, server.path, event);
    } catch (error) {
      console.error("Error running npm install:", error);
      event.sender.send("error", {
        serverId,
        message: "Error running npm install: " + error.message,
      });
    }
  }
  static LoadServerLogs(event, serverId) {
    try {
      const logPath = path.join(dirname, "logs", `${serverId}.json`);
      if (fs.existsSync(logPath)) {
        const logs = JSON.parse(fs.readFileSync(logPath, "utf8"));
        event.sender.send("logs-loaded", logs);
      } else {
        event.sender.send("logs-not-found", serverId);
      }
    } catch (error) {
      console.error("Error loading server logs:", error);
      event.sender.send("error", {
        serverId,
        message: "Error loading server logs: " + error.message,
      });
    }
  }
  static ShutdownAllServers() {
    const servers = loadConfig();
    let updated = false;
    for (const serverId in serverProcesses) {
      const proc = serverProcesses[serverId];
      if (proc && !proc.killed) {
        try {
          process.kill(proc.pid);
          delete serverProcesses[serverId];
          delete serverStates[serverId];
          const msg = `Server process ${proc.pid} killed.\n`;
          IpcMainController.WriteLog(serverId, msg);
          console.log(`✅ Killed running server process: ${proc.pid}`);
        } catch (err) {
          console.warn(`⚠️ Failed to kill process ${proc.pid}: ${err.message}`);
        }
      }
    }

    if (updated) saveConfig();
  }
}
setInterval(() => {
  console.log(serverProcesses);
}, 5000);
module.exports = IpcMainController;
