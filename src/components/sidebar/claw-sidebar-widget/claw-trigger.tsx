'use client'

import { Cpu } from 'lucide-react'
import { useClawStore } from '@/stores/claw-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ClawTriggerProps {
  onClick?: () => void
}

export function ClawTrigger({ onClick }: ClawTriggerProps) {
  const isConnected = useClawStore((s) => s.isConnected)
  const pendingInitiatives = useClawStore((s) =>
    s.initiatives.filter((i) => i.status === 'proposed').length
  )

  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative h-8 w-8 p-0"
      onClick={onClick}
    >
      <Cpu className="h-4 w-4" />

      {/* Connection status - small dot */}
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-zinc-900',
          isConnected ? 'bg-emerald-500' : 'bg-zinc-600'
        )}
      />

      {/* Attention badge - only for initiatives needing action */}
      {pendingInitiatives > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black">
          {pendingInitiatives}
        </span>
      )}
    </Button>
  )
}
