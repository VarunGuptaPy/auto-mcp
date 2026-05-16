/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  // API proxying is handled by src/app/api/[...path]/route.ts so that POST
  // bodies are forwarded correctly (next rewrites() drops them in dev mode).
};

export default config;
