import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from './Combobox'

/**
 * Regression coverage for the Scanner "To location" picker. The picker derives
 * its options from the distinct set of asset locations, so "cutting all the
 * spaces" means rendering the Combobox with an empty options array.
 */
describe('Combobox — empty options (all locations cut)', () => {
  it('shows the empty message and offers no selectable option', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <Combobox
        value=""
        onChange={onChange}
        options={[]}
        placeholder="Select a location…"
        searchPlaceholder="Search locations…"
        emptyMessage={(q) => `No location matches “${q}”`}
        aria-label="To location"
      />,
    )

    // Trigger shows the placeholder — nothing is selected.
    const trigger = screen.getByRole('button', { name: 'To location' })
    expect(trigger.textContent).toContain('Select a location…')

    await user.click(trigger)

    // Empty-state copy is visible (getByText throws if absent)…
    screen.getByText('No location matches “”')
    // …and there is literally no option to pick.
    expect(screen.queryAllByRole('option')).toHaveLength(0)

    // Typing a brand-new location name still surfaces nothing selectable.
    await user.keyboard('Blue Hall')
    screen.getByText('No location matches “Blue Hall”')
    expect(screen.queryAllByRole('option')).toHaveLength(0)

    // The user can never produce a value → onChange is never called.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('with options present, search filters and selecting fires onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <Combobox
        value=""
        onChange={onChange}
        options={[
          { value: 'Blue Hall', label: 'Blue Hall' },
          { value: 'Red Hall', label: 'Red Hall' },
          { value: 'Storage A', label: 'Storage A' },
        ]}
        searchPlaceholder="Search locations…"
        aria-label="To location"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'To location' }))
    expect(screen.queryAllByRole('option')).toHaveLength(3)

    await user.keyboard('hall')
    const options = screen.queryAllByRole('option')
    expect(options).toHaveLength(2)

    await user.click(within(options[0]).getByText('Blue Hall'))
    expect(onChange).toHaveBeenCalledWith('Blue Hall')
  })
})

describe('Combobox — allowCreate (the fix for cut locations)', () => {
  it('lets the user commit a typed location when none exist', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <Combobox
        value=""
        onChange={onChange}
        options={[]}
        allowCreate
        searchPlaceholder="Search locations…"
        createLabel={(q) => `Use new location “${q}”`}
        emptyMessage={(q) => `No location matches “${q}”`}
        aria-label="To location"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'To location' }))
    await user.keyboard('Storage C')

    // The create row is now the one selectable option.
    const create = screen.getByText('Use new location “Storage C”')
    await user.click(create)

    expect(onChange).toHaveBeenCalledWith('Storage C')
  })

  it('does not offer create when the typed value already exists', async () => {
    const user = userEvent.setup()
    render(
      <Combobox
        value=""
        onChange={vi.fn()}
        options={[{ value: 'Blue Hall', label: 'Blue Hall' }]}
        allowCreate
        createLabel={(q) => `Use new location “${q}”`}
        aria-label="To location"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'To location' }))
    await user.keyboard('Blue Hall')

    expect(screen.queryByText('Use new location “Blue Hall”')).toBeNull()
    expect(screen.queryAllByRole('option')).toHaveLength(1)
  })
})
