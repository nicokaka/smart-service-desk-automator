import { initApp } from "./renderer/app.mjs";

initApp().catch((error) => {
  console.error("Failed to initialize app:", error);
});
