import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

let loaded = false;

function resolveWorkspaceRoot() {
  const cwd = process.cwd();

  if (existsSync(resolve(cwd, "aijinhoblog"))) {
    return cwd;
  }

  return resolve(cwd, "..");
}

export function loadWorkspaceEnv() {
  if (loaded) {
    return;
  }

  loadEnvConfig(resolveWorkspaceRoot());
  loaded = true;
}

loadWorkspaceEnv();
