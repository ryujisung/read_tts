import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // hwp.js 는 파일 경로로도 읽을 수 있게 만들어져 `fs` 를 부른다.
      // 브라우저에는 그런 것이 없고, 우리는 바이트를 직접 넘기므로 빈 것으로 바꾼다.
      fs: { browser: "./src/lib/script/fs-stub.ts" },
    },
  },
};

export default nextConfig;
