import { useState, useEffect, useCallback, useRef } from 'react'
import { zoneAPI } from '@/lib/api'

/**
 * Hook to detect and manage user's zone based on location
 * Automatically detects zone when location is available
 */
export function useZone(location) {
  const [zoneId, setZoneId] = useState(null)
  const [zoneStatus, setZoneStatus] = useState('loading') // 'loading' | 'IN_SERVICE' | 'OUT_OF_SERVICE'
  const [zone, setZone] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const prevCoordsRef = useRef({ latitude: null, longitude: null })

  const toNumber = (value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // Detect zone when location is available
  const detectZone = useCallback(async (lat, lng) => {
    if (!lat || !lng) {
      setZoneStatus('OUT_OF_SERVICE')
      setZoneId(null)
      setZone(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const response = await zoneAPI.detectZone(lat, lng)
      
      if (response.data?.success) {
        const data = response.data.data
        
        if (data.status === 'IN_SERVICE' && data.zoneId) {
          setZoneId(data.zoneId)
          setZone(data.zone)
          setZoneStatus('IN_SERVICE')
          
          // Store in localStorage for persistence
          localStorage.setItem('userZoneId', data.zoneId)
          localStorage.setItem('userZone', JSON.stringify(data.zone))
          localStorage.setItem(
            'userZoneDetectedCoords',
            JSON.stringify({ latitude: lat, longitude: lng, detectedAt: Date.now() }),
          )
        } else {
          // OUT_OF_SERVICE
          setZoneId(null)
          setZone(null)
          setZoneStatus('OUT_OF_SERVICE')
          localStorage.removeItem('userZoneId')
          localStorage.removeItem('userZone')
        }
      } else {
        throw new Error(response.data?.message || 'Failed to detect zone')
      }
    } catch (err) {
      console.error('Error detecting zone:', err)
      setError(err.response?.data?.message || err.message || 'Failed to detect zone')
      setZoneStatus('OUT_OF_SERVICE')
      setZoneId(null)
      setZone(null)
      
      // Try to use cached zone only when current coordinates are unavailable
      // OR when current location is very close to cached-detection location.
      const cachedZoneId = localStorage.getItem('userZoneId')
      const cachedCoordsRaw = localStorage.getItem('userZoneDetectedCoords')
      const currentLat = toNumber(lat)
      const currentLng = toNumber(lng)
      let canUseCachedZone = !currentLat || !currentLng

      if (!canUseCachedZone && cachedCoordsRaw) {
        try {
          const parsed = JSON.parse(cachedCoordsRaw)
          const cachedLat = toNumber(parsed?.latitude)
          const cachedLng = toNumber(parsed?.longitude)
          if (cachedLat && cachedLng) {
            const distance = calculateDistanceKm(currentLat, currentLng, cachedLat, cachedLng)
            // Reuse cached zone only if user is still near the previous detected location.
            canUseCachedZone = distance <= 1
          }
        } catch (_parseError) {
          canUseCachedZone = false
        }
      }

      if (cachedZoneId && canUseCachedZone) {
        const cachedZone = localStorage.getItem('userZone')
        setZoneId(cachedZoneId)
        setZone(cachedZone ? JSON.parse(cachedZone) : null)
        setZoneStatus('IN_SERVICE')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-detect zone when location changes
  useEffect(() => {
    const lat = location?.latitude
    const lng = location?.longitude

    // Check if coordinates have changed significantly (threshold: ~10 meters)
    const coordThreshold = 0.0001 // approximately 10 meters
    const coordsChanged = 
      !prevCoordsRef.current.latitude ||
      !prevCoordsRef.current.longitude ||
      Math.abs(prevCoordsRef.current.latitude - (lat || 0)) > coordThreshold ||
      Math.abs(prevCoordsRef.current.longitude - (lng || 0)) > coordThreshold

    if (lat && lng) {
      // Only detect zone if coordinates changed significantly
      if (coordsChanged) {
        prevCoordsRef.current = { latitude: lat, longitude: lng }
        detectZone(lat, lng)
      }
    } else {
      // Try to use cached zone if location not available
      const cachedZoneId = localStorage.getItem('userZoneId')
      if (cachedZoneId) {
        const cachedZone = localStorage.getItem('userZone')
        setZoneId(cachedZoneId)
        setZone(cachedZone ? JSON.parse(cachedZone) : null)
        setZoneStatus('IN_SERVICE')
      } else {
        setZoneStatus('OUT_OF_SERVICE')
        setZoneId(null)
        setZone(null)
      }
    }
  }, [location?.latitude, location?.longitude, detectZone])

  // Manual refresh zone
  const refreshZone = useCallback(() => {
    const lat = location?.latitude
    const lng = location?.longitude
    if (lat && lng) {
      detectZone(lat, lng)
    }
  }, [location?.latitude, location?.longitude, detectZone])

  return {
    zoneId,
    zone,
    zoneStatus,
    loading,
    error,
    isInService: zoneStatus === 'IN_SERVICE',
    isOutOfService: zoneStatus === 'OUT_OF_SERVICE',
    refreshZone
  }
}
