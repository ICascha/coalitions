import { useEffect, useState } from 'react';
import { POWER_BLOC_COLORS } from './ungaMapConfig';
import { blendWithWhite } from './ungaMapColors';
import type { AlignmentMap } from './ungaMapTypes';

/**
 * Creates a globe texture by rendering the SVG map to canvas with UNGA colors
 */
export const useSvgGlobeTexture = (
  alignmentMap: AlignmentMap,
  svgMarkup: string
): string | null => {
  const [textureUrl, setTextureUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (!svgMarkup || Object.keys(alignmentMap).length === 0) {
      return;
    }

    // Create a modified SVG with UNGA colors applied
    let modifiedSvg = svgMarkup;
    
    // Apply colors to each country path by ID
    Object.entries(alignmentMap).forEach(([alpha3, alignment]) => {
      const color = blendWithWhite(
        POWER_BLOC_COLORS[alignment.bloc],
        Math.max(alignment.strength, 0.6)
      );
      
      // Match path with this country ID and add/replace fill
      // Handle both lowercase and uppercase IDs
      const patterns = [
        new RegExp(`(<path[^>]*\\bid="${alpha3}"[^>]*)>`, 'gi'),
        new RegExp(`(<path[^>]*\\bid="${alpha3.toLowerCase()}"[^>]*)>`, 'gi'),
      ];
      
      patterns.forEach(regex => {
        modifiedSvg = modifiedSvg.replace(regex, `$1 fill="${color}">`);
      });
    });
    
    // Ensure paths without alignment data get a default gray color
    // Add a style element to set default fill
    modifiedSvg = modifiedSvg.replace(
      '<svg',
      `<svg style="background: #e8ecf0"`
    );
    
    // Create an image from the SVG
    const blob = new Blob([modifiedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Create canvas with equirectangular dimensions
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Fill with ocean/background color
        ctx.fillStyle = '#e8ecf0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the SVG image scaled to fit
        // The SVG viewBox is quite large, so we need to preserve aspect ratio
        const aspectRatio = img.width / img.height;
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let offsetX = 0;
        let offsetY = 0;
        
        if (aspectRatio > 2) {
          // Wider than expected - fit to height
          drawHeight = canvas.height;
          drawWidth = drawHeight * aspectRatio;
          offsetX = (canvas.width - drawWidth) / 2;
        } else if (aspectRatio < 2) {
          // Taller than expected - fit to width
          drawWidth = canvas.width;
          drawHeight = drawWidth / aspectRatio;
          offsetY = (canvas.height - drawHeight) / 2;
        }
        
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        
        // Convert to data URL
        setTextureUrl(canvas.toDataURL('image/png'));
      }
      
      URL.revokeObjectURL(url);
    };
    
    img.onerror = (e) => {
      console.error('Failed to load SVG for globe texture:', e);
      URL.revokeObjectURL(url);
      // Create a fallback procedural texture
      createProceduralTexture(alignmentMap, setTextureUrl);
    };
    
    img.src = url;
    
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [alignmentMap, svgMarkup]);
  
  return textureUrl;
};

/**
 * Creates a procedural globe texture with UNGA color scheme
 * Generates a stylized world map with power bloc colors
 */
function createProceduralTexture(
  _alignmentMap: AlignmentMap,
  setTextureUrl: (url: string) => void
) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return;
  
  // Create a subtle gradient for the ocean
  const oceanGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  oceanGradient.addColorStop(0, '#e1e8ed');
  oceanGradient.addColorStop(0.5, '#eef2f5');
  oceanGradient.addColorStop(1, '#e1e8ed');
  ctx.fillStyle = oceanGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Power bloc colors for continent regions (using actual UNGA colors)
  const colors = {
    usa: blendWithWhite(POWER_BLOC_COLORS.USA, 0.7),     // Green - North America
    eu: blendWithWhite(POWER_BLOC_COLORS.EU, 0.7),       // Blue - Europe
    china: blendWithWhite(POWER_BLOC_COLORS.CHINA, 0.7), // Red - Asia/China aligned
    russia: blendWithWhite(POWER_BLOC_COLORS.RUSSIA, 0.7), // Orange - Russia
    neutral: '#c9d1d9', // Gray for neutral regions
  };
  
  // Draw stylized continents with power bloc colors
  // North America (USA aligned)
  drawContinent(ctx, [
    { x: 280, y: 280, rx: 180, ry: 120 },
    { x: 450, y: 350, rx: 100, ry: 100 },
    { x: 550, y: 450, rx: 60, ry: 80 },
  ], colors.usa);
  
  // South America (China aligned)
  drawContinent(ctx, [
    { x: 520, y: 550, rx: 80, ry: 150 },
    { x: 560, y: 700, rx: 60, ry: 100 },
  ], colors.china);
  
  // Europe (EU aligned)
  drawContinent(ctx, [
    { x: 1050, y: 260, rx: 80, ry: 60 },
    { x: 1120, y: 310, rx: 60, ry: 50 },
    { x: 980, y: 300, rx: 40, ry: 50 },
  ], colors.eu);
  
  // Africa (China aligned)
  drawContinent(ctx, [
    { x: 1080, y: 480, rx: 100, ry: 150 },
    { x: 1100, y: 620, rx: 80, ry: 100 },
  ], colors.china);
  
  // Russia (Russia aligned)
  drawContinent(ctx, [
    { x: 1350, y: 220, rx: 200, ry: 80 },
    { x: 1550, y: 250, rx: 150, ry: 60 },
  ], colors.russia);
  
  // China and East Asia (China aligned)
  drawContinent(ctx, [
    { x: 1480, y: 380, rx: 120, ry: 80 },
    { x: 1600, y: 420, rx: 80, ry: 60 },
    { x: 1700, y: 480, rx: 40, ry: 50 },
  ], colors.china);
  
  // India and South Asia (mixed)
  drawContinent(ctx, [
    { x: 1350, y: 450, rx: 70, ry: 90 },
  ], colors.neutral);
  
  // Middle East
  drawContinent(ctx, [
    { x: 1180, y: 380, rx: 60, ry: 50 },
  ], colors.neutral);
  
  // Australia (EU/USA aligned)
  drawContinent(ctx, [
    { x: 1700, y: 640, rx: 90, ry: 70 },
  ], colors.eu);
  
  // Add subtle grid lines
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.08)';
  ctx.lineWidth = 1;
  
  // Curved latitude lines for spherical feel
  for (let i = 1; i < 8; i++) {
    const y = (canvas.height / 8) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 20) {
      const wave = Math.sin((x / canvas.width) * Math.PI) * 3;
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  
  // Longitude lines
  for (let i = 1; i < 16; i++) {
    const x = (canvas.width / 16) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  
  // Add country borders effect
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  
  setTextureUrl(canvas.toDataURL('image/png'));
}

// Helper function to draw a continent as overlapping ellipses
function drawContinent(
  ctx: CanvasRenderingContext2D, 
  shapes: Array<{ x: number; y: number; rx: number; ry: number }>,
  color: string
) {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1.5;
  
  shapes.forEach(shape => {
    ctx.beginPath();
    ctx.ellipse(shape.x, shape.y, shape.rx, shape.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // Draw borders
  shapes.forEach(shape => {
    ctx.beginPath();
    ctx.ellipse(shape.x, shape.y, shape.rx, shape.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

export default useSvgGlobeTexture;

