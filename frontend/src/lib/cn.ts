import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The app runs a custom Tailwind v4 theme (see src/styles/tokens.css +
// globals.css). tailwind-merge can't know our non-standard radius/shadow
// scales, so we register them — otherwise a later utility wouldn't correctly
// override an earlier conflicting one (e.g. `cn('rounded-sm','rounded-lg')`
// → `rounded-lg`; `cn('shadow-raised','shadow-overlay')` → `shadow-overlay`).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['xs', 'sm', 'md', 'lg', 'pill'] }],
      shadow: [{ shadow: ['flat', 'raised', 'overlay'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
