import * as RT from '@radix-ui/react-tooltip'

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <RT.Provider delayDuration={200}>
      <RT.Root>
        <RT.Trigger asChild>{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content
            sideOffset={6}
            className="z-tooltip rounded-sm bg-surface-inverted px-2.5 py-1.5 text-[12px] text-text-inverted shadow-overlay data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in"
          >
            {label}
            <RT.Arrow className="fill-surface-inverted" />
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  )
}
