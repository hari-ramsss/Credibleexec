import { spawn } from "node:child_process";
import path from "node:path";
import { root } from "../contracts/scripts/compile";
process.loadEnvFile(path.join(root, ".local/local.env"));
// Inherited shell settings take precedence over a later Next .env load; local mode stays explicit.
process.env.NEXT_PUBLIC_PRIVY_APP_ID = "";
const child = spawn(
  process.execPath,
  [
    path.join(root, "app/node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
  ],
  {
    cwd: path.join(root, "app"),
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
