/**
 * Pre-compute UNGA alignment map data from raw API response.
 * 
 * Input:  public/unga_map_data.json (raw API format with verbose bloc data)
 * Output: public/unga_alignment_precomputed.json (compact pre-computed format)
 * 
 * Run with: node scripts/precompute-unga-map.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = resolve(__dirname, '../public/unga_map_data.json');
const OUTPUT_PATH = resolve(__dirname, '../public/unga_alignment_precomputed.json');

const POWER_BLOCS = ['EU', 'USA', 'CHINA', 'RUSSIA'];

// Round to 2 decimal places to save space
const round2 = (n) => Math.round(n * 100) / 100;

function precomputeAlignmentMap(rawData) {
  const result = {};

  for (const countryEntry of rawData.countries) {
    const countryKey = countryEntry.country;
    
    // Extract distances for each bloc
    const metrics = {};
    let bestBloc = null;
    let bestDistance = null;

    for (const blocRow of countryEntry.blocs) {
      const bloc = blocRow.bloc.toUpperCase();
      if (!POWER_BLOCS.includes(bloc)) continue;

      const distance = blocRow.average_distance;
      if (distance == null) continue;

      metrics[bloc] = round2(distance);

      // Find closest bloc (lowest distance)
      if (bestDistance === null || distance < bestDistance) {
        bestDistance = distance;
        bestBloc = bloc;
      }
    }

    if (bestBloc && bestDistance !== null) {
      // Strength: closer = stronger (assuming distances roughly 0-4)
      const strength = round2(Math.max(0, 1 - bestDistance / 4));

      result[countryKey] = {
        b: bestBloc,           // bloc (shortened key)
        v: round2(bestDistance), // value (distance to closest bloc)
        s: strength,           // strength (0-1)
        m: metrics,            // metrics (distances to all blocs)
      };
    }
  }

  return result;
}

// Main execution
console.log('Reading raw data from:', INPUT_PATH);
const rawData = JSON.parse(readFileSync(INPUT_PATH, 'utf-8'));
console.log(`Found ${rawData.countries.length} countries`);

const precomputed = precomputeAlignmentMap(rawData);
const countryCount = Object.keys(precomputed).length;

// Output compact JSON (no pretty printing)
const output = JSON.stringify(precomputed);
writeFileSync(OUTPUT_PATH, output, 'utf-8');

const inputSize = readFileSync(INPUT_PATH).length;
const outputSize = output.length;
const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);

console.log(`\nProcessed ${countryCount} countries`);
console.log(`Input size:  ${(inputSize / 1024).toFixed(1)} KB`);
console.log(`Output size: ${(outputSize / 1024).toFixed(1)} KB`);
console.log(`Reduction:   ${reduction}%`);
console.log(`\nWritten to: ${OUTPUT_PATH}`);


