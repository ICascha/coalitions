'use client'

import { useState, useEffect } from 'react'

// Breakpoint for mobile (you can adjust this value)
export const MOBILE_BREAKPOINT = 800 // Typical tablet/mobile breakpoint

export const useWindowSize = () => {
  // Initialize with null to handle SSR
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    // Handler to call on window resize
    const handleResize = () => {
      setWidth(window.innerWidth)
    }
    
    // Set initial size
    handleResize()
    
    // Add event listener
    window.addEventListener('resize', handleResize)
    
    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize)
  }, []) // Empty array ensures effect is only run on mount

  return width
}