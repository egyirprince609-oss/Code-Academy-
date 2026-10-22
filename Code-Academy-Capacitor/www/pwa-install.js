let deferredInstallPrompt = null;

const INSTALL_DISMISSED_KEY = "codeAcademyInstallDismissed";

window.addEventListener("beforeinstallprompt", event => {
  console.log("Code Academy can be installed.");

  event.preventDefault();

  deferredInstallPrompt = event;

  showInstallBanner();
});

function showInstallBanner() {
  if (document.getElementById("codeAcademyInstallBanner")) {
    return;
  }

  if (localStorage.getItem(INSTALL_DISMISSED_KEY) === "true") {
    return;
  }

  const banner = document.createElement("div");

  banner.id = "codeAcademyInstallBanner";

  banner.innerHTML = `
    <div class="pwa-install-content">

      <div class="pwa-install-icon">
        <img src="/icons/icon-192.png" alt="Code Academy">
      </div>

      <div class="pwa-install-text">
        <strong>Download Code Academy</strong>
        <span>Install Code Academy on your phone for quick access.</span>
      </div>

      <button id="codeAcademyInstallButton">
        Install
      </button>

      <button id="codeAcademyCloseButton" class="pwa-close">
        ×
      </button>

    </div>
  `;

  document.body.appendChild(banner);

  document
    .getElementById("codeAcademyInstallButton")
    .addEventListener("click", installCodeAcademy);

  document
    .getElementById("codeAcademyCloseButton")
    .addEventListener("click", () => {
      banner.remove();

      localStorage.setItem(
        INSTALL_DISMISSED_KEY,
        "true"
      );
    });
}

async function installCodeAcademy() {
  if (!deferredInstallPrompt) {
    showManualInstallInstructions();
    return;
  }

  const installPrompt = deferredInstallPrompt;

  deferredInstallPrompt = null;

  installPrompt.prompt();

  const result = await installPrompt.userChoice;

  console.log(
    "Code Academy install result:",
    result.outcome
  );

  const banner = document.getElementById(
    "codeAcademyInstallBanner"
  );

  if (banner) {
    banner.remove();
  }
}

window.addEventListener("appinstalled", () => {
  console.log("Code Academy was installed.");

  deferredInstallPrompt = null;

  const banner = document.getElementById(
    "codeAcademyInstallBanner"
  );

  if (banner) {
    banner.remove();
  }
});

function showManualInstallInstructions() {
  const message = document.createElement("div");

  message.innerHTML = `
    <div class="pwa-manual-overlay">

      <div class="pwa-manual-box">

        <button class="pwa-manual-close">
          ×
        </button>

        <h2>Install Code Academy</h2>

        <p>
          Your browser does not currently show the automatic
          install button.
        </p>

        <p>
          Tap the browser menu <strong>⋮</strong>
          and choose:
        </p>

        <strong>
          Add to Home screen
        </strong>

        <p>
          or
        </p>

        <strong>
          Install app
        </strong>

      </div>

    </div>
  `;

  document.body.appendChild(message);

  message
    .querySelector(".pwa-manual-close")
    .addEventListener("click", () => {
      message.remove();
    });
}
