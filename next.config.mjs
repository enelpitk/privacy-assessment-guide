/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // ESLint is not configured in this project; type checking still runs in `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
