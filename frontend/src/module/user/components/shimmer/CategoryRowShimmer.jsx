import React from "react"
import TextShimmer from "./TextShimmer"

/**
 * CategoryRowShimmer - Shimmer for horizontal circular categories row
 */
export default function CategoryRowShimmer({ count = 8 }) {
  const items = Array.from({ length: count }, (_, i) => i)

  return (
    <div className="flex items-center gap-4 sm:gap-6 overflow-hidden py-2 px-1 w-full">
      {items.map((i) => (
        <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full shimmer-effect shadow-sm" />
          <TextShimmer width="w-14 sm:w-16" height="h-3 sm:h-3.5" rounded="rounded" />
        </div>
      ))}
    </div>
  )
}
