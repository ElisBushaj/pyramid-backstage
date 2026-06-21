import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom doesn't implement these; Radix Popover/Portal touch them on open.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

afterEach(() => cleanup())
