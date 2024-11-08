import replace from '@rollup/plugin-replace'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    replace({
      preventAssignment: true,
      __CDN_URL__: '"https://cdn.jsdelivr.net/npm/@iplookup/country"',
      __DATA_TYPE__: '"country"',
    }),
  ],
})