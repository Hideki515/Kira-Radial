import type { Config, Profile } from "./types";
// Fonte única dos padrões: o mesmo JSON é embutido no Rust (src-tauri/src/config.rs, include_str!).
import raw from "./default-config.json";

export const defaultConfig = raw as Config;
export const defaultProfile: Profile = defaultConfig.profiles[0];

/** Cópia profunda, para o editor nunca mutar os padrões. */
export const cloneConfig = (c: Config): Config => structuredClone(c);
