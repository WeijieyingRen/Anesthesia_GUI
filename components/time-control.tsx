"use client"

import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Play, Pause, SkipBack, SkipForward } from "lucide-react"
import { cn } from "@/lib/utils"

interface TimeControlProps {
  currentHour: number
  maxHour: number
  onHourChange: (hour: number) => void
  isPlaying: boolean
  onPlayPause: () => void
  className?: string
}

export default function TimeControl({
  currentHour,
  maxHour,
  onHourChange,
  isPlaying,
  onPlayPause,
  className,
}: TimeControlProps) {
  const handleReset = () => {
    onHourChange(0)
  }

  const handleSkipForward = () => {
    onHourChange(Math.min(currentHour + 1, maxHour))
  }

  const handleSkipBackward = () => {
    onHourChange(Math.max(currentHour - 1, 0))
  }

  return (
    <div className={cn("flex flex-col bg-red-100 border border-red-200 rounded-lg p-2 shadow-md relative", className)}>
      {/* Add a subtle gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 to-transparent pointer-events-none rounded-lg" />

      <div className="flex items-center justify-between mb-1 relative z-10">
        <h3 className="text-sm font-semibold text-red-900">Time Control</h3>
        <div className="flex items-center">
          <span className="text-xs font-medium text-red-900">Hour: {currentHour}</span>
        </div>
      </div>

      <div className="mb-1 relative z-10">
        <Slider
          value={[currentHour]}
          min={0}
          max={maxHour}
          step={1}
          onValueChange={(value) => onHourChange(value[0])}
          className="[&>.relative>.absolute]:bg-red-600"
        />
      </div>

      <div className="flex justify-center space-x-2 relative z-10">
        <Button variant="outline" size="sm" onClick={handleReset} className="border-red-200 hover:bg-red-100 shadow-sm">
          <SkipBack className="h-3 w-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSkipBackward}
          className="border-red-200 hover:bg-red-100 shadow-sm"
        >
          <SkipBack className="h-3 w-3" />
        </Button>
        <Button size="sm" onClick={onPlayPause} className="bg-red-700 hover:bg-red-800 shadow-sm">
          {isPlaying ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSkipForward}
          className="border-red-200 hover:bg-red-100 shadow-sm"
        >
          <SkipForward className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

