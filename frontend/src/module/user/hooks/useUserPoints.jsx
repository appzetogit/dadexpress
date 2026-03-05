import { useEffect, useState } from "react"
import { userAPI } from "@/lib/api"

/**
 * Hook to fetch user "points" in a backward‑compatible way.
 * Currently derives points from referral stats (earned amount),
 * falling back to 0 on any error without affecting existing flows.
 */
export default function useUserPoints() {
  const [points, setPoints] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let isMounted = true

    const fetchPoints = async () => {
      try {
        setLoading(true)
        const response = await userAPI.getReferralStats()
        const data = response?.data?.data || response?.data

        if (!isMounted || !data) return

        const stats = data.referralStats || {}
        const earned = Number(stats.earned ?? 0)

        // Use a safe, non‑negative integer for points
        const safePoints =
          Number.isFinite(earned) && earned > 0
            ? Math.round(earned)
            : 0

        setPoints(safePoints)
      } catch (_error) {
        // Silently fall back to 0 to avoid breaking any UI flow
        if (isMounted) {
          setPoints(0)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchPoints()

    return () => {
      isMounted = false
    }
  }, [])

  return { points, loading }
}


