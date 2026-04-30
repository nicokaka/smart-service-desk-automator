export function initAboutModal(documentRef = document, electronAPI = window.electronAPI) {
  const aboutModal = documentRef.getElementById("about-modal");
  const openButton = documentRef.getElementById("btn-about");
  const closeButton = documentRef.getElementById("btn-close-about");
  const githubLink = documentRef.getElementById("about-github-link");

  if (!aboutModal || !openButton || !closeButton) {
    return;
  }

  if (aboutModal.dataset.bound === "true") {
    return;
  }

  aboutModal.dataset.bound = "true";

  openButton.addEventListener("click", () => {
    aboutModal.classList.remove("hidden");
  });

  closeButton.addEventListener("click", () => {
    aboutModal.classList.add("hidden");
  });

  aboutModal.addEventListener("click", (event) => {
    if (event.target === aboutModal) {
      aboutModal.classList.add("hidden");
    }
  });

  githubLink?.addEventListener("click", (event) => {
    event.preventDefault();
    const url = githubLink.getAttribute("href");
    if (!url) {
      return;
    }

    if (electronAPI?.external?.open) {
      electronAPI.external.open(url);
    } else {
      window.open(url, "_blank");
    }
  });
}
