// build.mjs
import { build } from 'vite';

const baseBuild = {
  emptyOutDir: false,
  modulePreload: { polyfill: false },
};

const baseOutput = {
  assetFileNames: 'assets/[name].[ext]',
};

async function buildContentScript(name) {
  await build({
    build: {
      ...baseBuild,
      rolldownOptions: {
        input: `src/${name}.ts`,
        output: {
          ...baseOutput,
          entryFileNames: `src/${name}.js`,
          format: 'iife',
          codeSplitting: false,
        },
      },
    },
  });
}

async function buildHtmlPage(name) {
  await build({
    base: './',
    build: {
      ...baseBuild,
      rolldownOptions: {
        input: `src/${name}.html`,
        output: {
          ...baseOutput,
          entryFileNames: `src/${name}.js`,
          format: 'iife',
          codeSplitting: false,
        },
      },
      sourcemap: 'inline',
    },
  });
}

async function buildBackground() {
  await build({
    build: {
      ...baseBuild,
      rolldownOptions: {
        input: 'src/background.ts',
        output: {
          ...baseOutput,
          entryFileNames: 'src/background.js',
          chunkFileNames: 'src/[name].js',
        },
      },
      sourcemap: 'inline',
    },
  });
}

const contentEntries = ['chaseContent', 'amazonContent'];
const htmlEntries = ['onboarding', 'options'];

for (const name of contentEntries) {
  await buildContentScript(name);
}

for (const name of htmlEntries) {
  await buildHtmlPage(name);
}
await buildBackground();
