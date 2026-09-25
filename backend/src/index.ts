import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();
app.listen(config.port, "127.0.0.1", () => {
  console.info(`LendLine API running on http://localhost:${config.port}`);
});
