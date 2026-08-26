import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 폰에서 LAN IP 로 dev 서버에 붙을 때 JS 청크가 cross-origin 으로 막힌다. 사설망 대역을 통째로 연다.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.16.*.*"],
  turbopack: {
    resolveAlias: {
      // hwp.js 는 파일 경로로도 읽을 수 있게 만들어져 `fs` 를 부른다.
      // 브라우저에는 그런 것이 없고, 우리는 바이트를 직접 넘기므로 빈 것으로 바꾼다.
      fs: { browser: "./src/lib/script/fs-stub.ts" },
    },
  },
};

export default nextConfig;
