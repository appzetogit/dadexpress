import { useState, useEffect, useCallback, useRef } from 'react'
import { zoneAPI } from '@/lib/api'
import { useProfile } from '../context/ProfileContext'


/**
 * Hook to detect and manage user's zone based on location
 * Automatically detects zone when location is available
 */
export function useZone(locationInput) {
  const { addresses = [] } = useProfile()
  // Normalize the input: if locationInput is the object returned from useLocation() hook
  // which contains a "location" property, extract that. Otherwise use locationInput.
  const location = locationInput && typeof locationInput === 'object' && ('location' in locationInput)
    ? locationInput.location
    : locationInput;

  const [zoneId, setZoneId] = useState(null)
  const [zoneStatus, setZoneStatus] = useState('loading') // 'loading' | 'IN_SERVICE' | 'OUT_OF_SERVICE'
  const [zone, setZone] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const prevCoordsRef = useRef({ latitude: null, longitude: null })

  // Listen to manual address selection changes reactively
  const [selectedAddressState, setSelectedAddressState] = useState(() => {
    const selectedRaw = localStorage.getItem("selectedDeliveryAddress")
    try {
      return selectedRaw ? JSON.parse(selectedRaw) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const handler = () => {
      const selectedRaw = localStorage.getItem("selectedDeliveryAddress")
      try {
        setSelectedAddressState(selectedRaw ? JSON.parse(selectedRaw) : null)
      } catch {
        setSelectedAddressState(null)
      }
    }
    window.addEventListener('delivery-address-selected', handler)
    return () => {
      window.removeEventListener('delivery-address-selected', handler)
    }
  }, [])

  const isManualMode = !!(locationInput?.isManualMode || (selectedAddressState?.mode === 'saved' && selectedAddressState?.addressId))

  const toNumber = (value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  const getManualAddressDetails = useCallback(() => {
    if (!isManualMode || !selectedAddressState?.addressId) return null
    const matched = addresses.find(addr => String(addr.id || addr._id) === String(selectedAddressState.addressId))
    return matched || null
  }, [isManualMode, selectedAddressState?.addressId, addresses])

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

    // Immediately mark as loading and clear old zoneId to prevent stale zone data
    // being used while we wait for the new zone detection API call
    setZoneStatus('loading')
    setZoneId(null)

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
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-detect zone when location changes or manual address selection changes
  useEffect(() => {
    const manualAddress = getManualAddressDetails()
    
    // Extract manual details if available
    let manualLat = null
    let manualLng = null
    let manualZoneId = null
    let manualZone = null
    
    if (manualAddress) {
      const coords = Array.isArray(manualAddress.location?.coordinates)
        ? manualAddress.location.coordinates
        : null
      manualLng = toNumber(coords?.[0] ?? manualAddress.longitude ?? manualAddress.lng)
      manualLat = toNumber(coords?.[1] ?? manualAddress.latitude ?? manualAddress.lat)
      manualZoneId = manualAddress.zoneId || manualAddress.zone?._id || manualAddress.zone?.id || null
      manualZone = manualAddress.zone || null
    }

    const activeLat = isManualMode ? manualLat : location?.latitude
    const activeLng = isManualMode ? manualLng : location?.longitude

    if (isManualMode) {
      if (activeLat && activeLng) {
        // Saved/manual addresses can carry stale zoneId data.
        // Always prefer fresh polygon detection from the selected address coordinates.
        const coordThreshold = 0.0001
        const coordsChanged = 
          !prevCoordsRef.current.latitude ||
          !prevCoordsRef.current.longitude ||
          Math.abs(prevCoordsRef.current.latitude - activeLat) > coordThreshold ||
          Math.abs(prevCoordsRef.current.longitude - activeLng) > coordThreshold

        if (coordsChanged) {
          prevCoordsRef.current = { latitude: activeLat, longitude: activeLng }
          detectZone(activeLat, activeLng)
        }
        return
      } else if (manualZoneId) {
        // Fall back to persisted zone only when the address has no usable coordinates.
        setZoneId(manualZoneId)
        setZone(manualZone)
        setZoneStatus('IN_SERVICE')
        setLoading(false)
        setError(null)
        return
      } else {
        // We are in manual mode but address details/coordinates are loading or not available yet
        setZoneStatus('loading')
        return
      }
    }

    // --- GPS MODE / NON-MANUAL MODE ---
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
      // If location is truly null/undefined (not just empty strings), 
      // we might still be waiting for useLocation to initialize.
      // Only set OUT_OF_SERVICE if we have location object but no coords.
      if (location === null) {
         setZoneStatus('loading')
      } else {
         setZoneStatus('OUT_OF_SERVICE')
         setZoneId(null)
         setZone(null)
      }
    }
  }, [location?.latitude, location?.longitude, detectZone, isManualMode, getManualAddressDetails, locationInput?.isManualMode])

  // Manual refresh zone
  const refreshZone = useCallback(() => {
    let activeLat = location?.latitude
    let activeLng = location?.longitude

    if (isManualMode) {
      const manualAddress = getManualAddressDetails()
      if (manualAddress) {
        const coords = Array.isArray(manualAddress.location?.coordinates)
          ? manualAddress.location.coordinates
          : null
        activeLng = toNumber(coords?.[0] ?? manualAddress.longitude ?? manualAddress.lng)
        activeLat = toNumber(coords?.[1] ?? manualAddress.latitude ?? manualAddress.lat)
      }
    }

    if (activeLat && activeLng) {
      detectZone(activeLat, activeLng)
    }
  }, [location?.latitude, location?.longitude, detectZone, isManualMode, getManualAddressDetails])

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
