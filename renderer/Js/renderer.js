const { ipcRenderer } = require("electron");
const AnsiToHtml = require("ansi-to-html");
const ansiConvert = new AnsiToHtml();

let currentServerId = null;
const dropZone = document.getElementById("file-input");
dropZone.addEventListener("change", async () => {
  const file = dropZone.files[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  ipcRenderer.send("upload-buffer", {
    serverId: currentServerId,
    name: file.name,
    mime: file.type,
    buffer: buffer,
  });
});

document.getElementById("new-server").onclick = () => {
  const modal = document.getElementById("modal");
  const input = document.getElementById("modal-input");

  input.value = "";
  modal.classList.remove("hidden");

  const submit = document.getElementById("modal-submit");
  const cancel = document.getElementById("modal-cancel");

  const submitHandler = () => {
    const name = input.value.trim();
    if (name) {
      ipcRenderer.send("create-server", name);
      modal.classList.add("hidden");
      cleanup();
    }
  };
  const cancelHandler = () => {
    modal.classList.add("hidden");
    cleanup();
  };

  const cleanup = () => {
    submit.removeEventListener("click", submitHandler);
    cancel.removeEventListener("click", cancelHandler);
  };

  submit.addEventListener("click", submitHandler);
  cancel.addEventListener("click", cancelHandler);
};

document.getElementById("update-entry").onclick = () => {
  const entryFile = document.getElementById("entry-file").value;
  if (!entryFile || !currentServerId) return;
  ipcRenderer.send("update-entry", { serverId: currentServerId, entryFile });
  ShowAlert("Entry file updated!");
};

document.getElementById("start-server").onclick = () => {
  ipcRenderer.send("start-server", currentServerId);
};
document.getElementById("restart-server").onclick = () => {
  ipcRenderer.send("restart-server", currentServerId);
};
document.getElementById("npm-install").onclick = () => {
  ipcRenderer.send("run-npm-install", currentServerId);
};

document.getElementById("stop-server").onclick = () => {
  ShowConfirm("Are you sure you want to stop this server?").then(
    (confirmed) => {
      if (confirmed) {
        ipcRenderer.send("stop-server", currentServerId);
      }
    }
  );
};

document.getElementById("delete-server").onclick = () => {
  // Show Confirm
  ShowConfirm(
    "Are you sure you want to delete this server? \n This action cannot be undone"
  ).then((confirmed) => {
    if (confirmed) {
      ipcRenderer.send("delete-server", currentServerId);
    }
  });
};

ipcRenderer.on("server-created", (_, Created) => {
  ShowAlert(`Server created: ${Created.name}`);
  loadServers();
  showServer(Created);
});
ipcRenderer.on("server-deleted", () => {
  currentServerId = null;
  document.getElementById("server-info").style.display = "none";
  loadServers();
});
ipcRenderer.on("upload-complete", (_, server) => {
  showServer(server);
});
ipcRenderer.on("error", (e, { serverId, message }) => {
  if (serverId == currentServerId) {
    ShowAlert(message);
  }
});
function loadServers() {
  ipcRenderer.invoke("get-servers").then((servers) => {
    const list = document.getElementById("server-list");
    list.innerHTML = "";
    const ServersData = Object.values(servers);
    for (let server of ServersData) {
      const btn = document.createElement("button");
      btn.textContent = server.name;
      btn.onclick = () => showServer(server);
      list.appendChild(btn);
    }
  });
}
function LoadServerLogs(serverId) {
  ipcRenderer.send("load-log", serverId);
  ipcRenderer.on("logs-loaded", (e, Data) => {
    if (Array.isArray(Data)) {
      Data.forEach((Log) => {
        AppendLog(Log.message);
      });
    }
  });
}
loadServers();

function AppendLog(message) {
  const logContainer = document.getElementById("logs");
  const html = ansiConvert.toHtml(message);
  const div = document.createElement("div");
  div.innerHTML = html;
  logContainer.appendChild(div);
  logContainer.scrollTop = logContainer.scrollHeight;
}
function showServer(server) {
  currentServerId = server.id;
  document.getElementById("server-info").style.display = "block";
  document.getElementById("server-name").textContent = server.name;
  document.getElementById("entry-file").value = server.entryFile || "";
  document.getElementById("logs").textContent = "";
  LoadServerLogs(server.id);
  ipcRenderer.on("log-update", (e, { serverId, message }) => {
    if (serverId == currentServerId) {
      AppendLog(message);
    }
  });
}
function ShowAlert(message, duration = 3000) {
  const alertBox = document.getElementById("alert");
  const messageBox = document.getElementById("alert-message");
  messageBox.textContent = message;
  alertBox.classList.remove("alert-hidden");
  alertBox.classList.add("alert-visible");

  const progress = alertBox.querySelector(".progress-bar");
  progress.style.animation = "none"; // restart animation
  void progress.offsetWidth; // reflow
  progress.style.animation = `progressAnim ${duration}ms linear forwards`;

  setTimeout(() => {
    alertBox.classList.remove("alert-visible");
    alertBox.classList.add("alert-hidden");
  }, duration);
}

function ShowConfirm(message) {
  return new Promise((resolve) => {
    const confirmBox = document.getElementById("confirm");
    const messageBox = document.getElementById("confirm-message");
    const yesBtn = document.getElementById("confirm-yes");
    const cancelBtn = document.getElementById("confirm-cancel");
    if (message && message?.includes("\n")) {
      message = message
        .split("\n")
        .map((line) => `<p>${line}</p>`)
        .join("");
    } else {
      message = `<p>${message}</p>`;
    }
    messageBox.innerHTML = message;
    confirmBox.classList.remove("confirm-hidden");
    confirmBox.classList.add("confirm-visible");

    function cleanup(result) {
      confirmBox.classList.remove("confirm-visible");
      confirmBox.classList.add("confirm-hidden");
      yesBtn.removeEventListener("click", yesHandler);
      cancelBtn.removeEventListener("click", cancelHandler);
      resolve(result);
    }

    function yesHandler() {
      cleanup(true);
    }

    function cancelHandler() {
      cleanup(false);
    }

    yesBtn.addEventListener("click", yesHandler);
    cancelBtn.addEventListener("click", cancelHandler);
  });
}
