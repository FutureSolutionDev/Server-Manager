const { exec } = require("child_process");
const fs = require("fs");
const { app } = require("electron");
const path = require("path");
const RequiredFolders = ["saved-servers", "logs"];
const dirname = app.getPath("userData");
RequiredFolders.forEach((folder) => {
  const folderPath = path.join(dirname, folder);
  if (!fs.existsSync(folderPath)) {
    SafeMkdir(folderPath);
  }
});
const configDir = path.join(dirname, "config");
if (!fs.existsSync(configDir)) {
  SafeMkdir(configDir);
}
const CONFIG_FILE = path.join(configDir, "servers.json");

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    const Data = fs.readFileSync(CONFIG_FILE, "utf8");
    if (Data) {
      return JSON.parse(Data);
    }
    return {};
  } else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2));
    console.log("Config file created at", CONFIG_FILE);
    return {};
  }
}
function FindServer(id) {
  const Servers = loadConfig();
  if (Servers[id]) {
    return Servers[id];
  }
  console.error("Server not found");
  return null;
}
function saveConfig(Id, Data) {
  try {
    let Servers = loadConfig();
    if (Servers[Id]) {
      Servers[Id] = { ...Servers[Id], ...Data };
    } else {
      Servers[Id] = Data;
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(Servers, null, 2));
    return FindServer(Id);
  } catch (err) {
    console.error("Failed to save config:", err);
    return null;
  }
}
function DeleteServer(Id) {
  let Servers = loadConfig();
  const server = Servers[Id];
  if (server) {
    fs.rmSync(server.path, { recursive: true, force: true });
    delete Servers[Id];
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(Servers, null, 2));
  }
}

function GetPidByPort(port) {
  return new Promise((resolve, reject) => {
    exec(`netstat -ano | findstr :${port}`, (err, stdout, stderr) => {
      if (err || stderr) return reject(err || new Error(stderr));
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[1].endsWith(`:${port}`)) {
          const pid = parts[4];
          return resolve(parseInt(pid));
        }
      }
      resolve(null);
    });
  });
}

function killPid(pid) {
  try {
    process.kill(pid, "SIGKILL");
    return true;
  } catch (e) {
    console.warn(`Failed to kill PID ${pid}:`, e.message);
    return false;
  }
}

function SafeMkdir(dirPath) {
  if (fs.existsSync(dirPath)) {
    const stat = fs.statSync(dirPath);
    if (stat.isDirectory()) return; // already fine
    if (stat.isFile()) {
      // Optional: handle this as a serious config error
      console.error(`ERROR: ${dirPath} is a file, not a directory.`);
      return;
    }
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

module.exports = {
  loadConfig,
  saveConfig,
  FindServer,
  DeleteServer,
  GetPidByPort,
  killPid,
  SafeMkdir,
};
