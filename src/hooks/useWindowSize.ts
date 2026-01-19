'use client'

import { useState, useEffect } from 'react'

// Breakpoint for mobile (you can adjust this value)
export const MOBILE_BREAKPOINT = 800 // Typical tablet/mobile breakpoint

export const useWindowSize = () => {
  // Initialize with null to handle SSR
  const [windowSize, setWindowSize] = useState<{ width: number | null, height: number | null }>({
    width: null,
    height: null,
  })

  useEffect(() => {
    // Handler to call on window resize
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }
    
    // Set initial size
    handleResize()
    
    // Add event listener
    window.addEventListener('resize', handleResize)
    
    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize)
  }, []) // Empty array ensures effect is only run on mount

  return windowSize
}
