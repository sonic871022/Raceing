import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
  server: {
    fs: {
      // The CLI accepts external environment modules; its integration test creates one here.
      allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(tmpdir())],
    },
  },
});
