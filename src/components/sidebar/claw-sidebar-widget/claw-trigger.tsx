'use client'

import { forwardRef } from 'react'
import { Cpu } from 'lucide-react'
import { useClawStore } from '@/stores/claw-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export const ClawTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, ...props }, ref) => {
  const isConnected = useClawStore((s) => s.isConnected)
  const pendingInitiatives = useClawStore((s) =>
    s.initiatives.filter((i) => i.status === 'proposed').length
  )
  const pendingQuestions = useClawStore((s) => s.questions.length)
  const needsAttention = pendingInitiatives + pendingQuestions

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      className={cn("relative h-8 w-8 p-0", className)}
      {...props}
    >
      <Cpu className="h-4 w-4" />

      {/* Connection status - small dot */}
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-zinc-900',
          isConnected ? 'bg-emerald-500' : 'bg-zinc-600'
        )}
      />

      {/* Attention badge - initiatives + questions needing action */}
      {needsAttention > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black">
          {needsAttention > 9 ? '9+' : needsAttention}
        </span>
      )}
    </Button>
  )
})

ClawTrigger.displayName = 'ClawTrigger'
