import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { paths } from "./paths.ts";

// Small JSON file store for dashboard-only state (plans, threads, groups, workflows, settings).
// Hermes owns tasks and agents; this only holds what Hermes has no place for.

function file(name: string) {
  return path.join(paths.data, `${name}.json`);
}

export function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(name: string, value: T) {
  fs.mkdirSync(paths.data, { recursive: true });
  const target = file(name);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, target);
}

export function updateJson<T>(name: string, fallback: T, fn: (value: T) => T | void): T {
  const current = readJson(name, fallback);
  const next = fn(current);
  const result = (next === undefined ? current : next) as T;
  writeJson(name, result);
  return result;
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

export function now() {
  return Math.floor(Date.now() / 1000);
}
