import React from "react"
import TextShimmer from "./TextShimmer"

/**
 * RestaurantCardShimmer - Shimmer card replica for restaurant items
 * @param {number} count - Number of cards to render
 */
export default function RestaurantCardShimmer({ count = 4, viewType = "grid" }) {
  const items = Array.from({ length: count }, (_, i) => i)

  if (viewType === "horizontal") {
    return (
      <div className="space-y-4 w-full">
        {items.map((i) => (
          <div
            key={i}
            className="flex flex-row bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-100 dark:border-gray-800 p-3 sm:p-4 gap-4 items-center overflow-hidden"
          >
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl shimmer-effect flex-shrink-0" />
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <TextShimmer width="w-2/3" height="h-5" />
              <TextShimmer width="w-1/2" height="h-3.5" />
              <div className="flex items-center gap-3 mt-2">
                <TextShimmer width="w-12" height="h-4" rounded="rounded-full" />
                <TextShimmer width="w-16" height="h-4" />
                <TextShimmer width="w-16" height="h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 lg:gap-6 w-full">
      {items.map((i) => (
        <div
          key={i}
          className="flex flex-col bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm p-0"
        >
          {/* Image Placeholder */}
          <div className="w-full h-44 sm:h-48 md:h-52 shimmer-effect" />
          
          {/* Card Body */}
          <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <TextShimmer width="w-3/5" height="h-5" />
              <TextShimmer width="w-10" height="h-5" rounded="rounded-full" />
            </div>
            <TextShimmer width="w-4/5" height="h-3.5" />
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800/80">
              <TextShimmer width="w-16" height="h-3.5" />
              <TextShimmer width="w-20" height="h-3.5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
