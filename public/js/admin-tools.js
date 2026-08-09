import { ApiService } from "./api.js";

export function initAdminTools() {
  window.getSecretWordPlzUwU = function () {
    const adminPassword = prompt("Please enter admin password :");
    if (!adminPassword) return;

    ApiService.verifyAdminKey(adminPassword)
      .then(() => ApiService.getSecretWordAdmin())
      .then((data) =>
        alert("The secret element of the day is : " + data.secretElement),
      )
      .catch((err) => alert(err.message));
  };

  window.forceReset = function () {
    const adminPassword = prompt("Please enter admin password :");
    if (!adminPassword) return;

    ApiService.verifyAdminKey(adminPassword)
      .then(() => {
        const keysToRemove = [
          "tries",
          "gameover",
          "status",
          "history",
          "date",
          "version",
          "saved_hints",
          "used_hint_types",
        ];
        keysToRemove.forEach((key) =>
          localStorage.removeItem(`celestedle_${key}`),
        );
        alert("Local data wiped ! Reloading window context structure.");
      })
      .catch((err) => alert(err.message));
  };

  window.randomSecret = function (reset = false) {
    const adminPassword = prompt("Please enter admin password:");
    if (!adminPassword) return;
    let newHash = Math.floor(Math.random() * 1000000000);
    if (reset) newHash = null;

    ApiService.triggerRandomSecret(adminPassword, newHash)
      .then((data) =>
        alert(data.error ? "Error : " + data.error : data.message),
      )
      .catch((err) => console.error("Server context update error:", err));
  };

  window.triggerReset = function () {
    const adminPassword = prompt("Please enter admin password :");
    if (!adminPassword) return;

    ApiService.triggerAdminReset(adminPassword)
      .then((data) => {
        alert(data.error ? "Error : " + data.error : data.message);
        if (data.success) {
          localStorage.clear();
          location.reload();
        }
      })
      .catch((err) => alert(err.message));
  };
}
