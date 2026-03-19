export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLogger(outputElement) {
  return function log(message, level = "info") {
    if (!outputElement) {
      return;
    }

    const entry = document.createElement("div");
    entry.classList.add("log-entry");

    if (level && level !== "info") {
      entry.classList.add(level);
    }

    entry.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
    outputElement.appendChild(entry);
    outputElement.scrollTop = outputElement.scrollHeight;
  };
}

export function bindTabs(tabButtons, tabContents) {
  tabButtons.forEach((tab) => {
    if (tab.dataset.bound === "true") {
      return;
    }

    tab.dataset.bound = "true";
    tab.addEventListener("click", () => {
      tabButtons.forEach((button) => button.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));

      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.tab);
      if (target) {
        target.classList.add("active");
      }
    });
  });
}

export function setButtonBusy(button, busyText) {
  if (!button) {
    return () => {};
  }

  const previous = {
    disabled: button.disabled,
    html: button.innerHTML,
    color: button.style.color,
    backgroundColor: button.style.backgroundColor,
  };

  button.disabled = true;
  button.innerHTML = busyText;

  return () => {
    button.disabled = previous.disabled;
    button.innerHTML = previous.html;
    button.style.color = previous.color;
    button.style.backgroundColor = previous.backgroundColor;
  };
}
