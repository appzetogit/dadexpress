import React from "react"
import TextShimmer from "./TextShimmer"

/**
 * DishCardShimmer - Shimmer for menu items / dish grid cards
 */
export default function DishCardShimmer({ count = 6 }) {
  const items = Array.from({ length: count }, (_, i) => i)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 w-full">
      {items.map((i) => (
        <div key={i} className="flex flex-col gap-2 w-full">
          <div className="aspect-square w-full rounded-xl shimmer-effect shadow-sm" />
          <TextShimmer width="w-4/5" height="h-3.5" />
          <TextShimmer width="w-2/5" height="h-3" />
        </div>
      ))}
    </div>
  )
}
