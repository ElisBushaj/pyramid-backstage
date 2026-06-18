import type { Config } from 'tailwindcss'

/**
 * Tailwind 4 is configured CSS-first via `@theme inline` in
 * `src/styles/globals.css`. This file only declares content paths for class
 * scanning — every token (color, radius, motion, z-index, font) lives in
 * `src/styles/tokens.css` and is aliased to utility classes via `@theme inline`.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
}

export default config
