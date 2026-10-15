import React from "react"

/**
 * TextShimmer - Renders an animated wave shimmer block for text placeholders
 * @param {string} className - Additional CSS classes
 * @param {string} width - Width class (default 'w-24')
 * @param {string} height - Height class (default 'h-4')
 * @param {string} rounded - Rounded border class (default 'rounded')
 */
export default function TextShimmer({
  className = "",
  width = "w-24",
  height = "h-4",
  rounded = "rounded-md",
  style = {}
}) {
  return (
    <span
      className={`inline-block ${width} ${height} ${rounded} shimmer-effect ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}
