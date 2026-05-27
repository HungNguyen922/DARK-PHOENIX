import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

// Load env from project root BEFORE anything else
loadEnvConfig("..");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
};

export default config;
