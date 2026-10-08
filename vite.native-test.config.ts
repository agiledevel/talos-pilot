import { mergeConfig } from "vite";

import baseConfig from "./vite.config.ts";

const nativeTestEntry = {
  name: "native-test-entry",
  transformIndexHtml: {
    order: "pre" as const,
    handler(html: string): string {
      const closingHead = "</head>";
      if (!html.includes(closingHead)) {
        throw new Error("Native test build requires a document head element.");
      }
      return html.replace(
        closingHead,
        '  <script type="module" src="/src/native-test-entry.ts"></script>\n</head>',
      );
    },
  },
};

export default mergeConfig(baseConfig, {
  plugins: [nativeTestEntry],
  build: {
    outDir: "dist-native-test",
    emptyOutDir: true,
  },
});
