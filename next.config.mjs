/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-parse", "read-excel-file", "tesseract.js", "@tesseract.js-data/eng"]
};

export default nextConfig;
