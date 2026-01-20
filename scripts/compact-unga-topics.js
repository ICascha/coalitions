#!/usr/bin/env node

/**
 * Compacts unga_map_data_topics.json to a smaller format
 * 
 * Original format:
 * {
 *   "countries": [
 *     {
 *       "country": "AFG",
 *       "name": "AFGHANISTAN",
 *       "blocs": [{ "bloc": "EU", "average_distance": 0.9548 }, ...],
 *       "top_disagreements_eu": [{ "topic": "Human Rights / Social", "distance": 1.377, "shared_votes": 348 }, ...],
 *       "top_agreements_eu": [{ "topic": "UN Administration", "distance": 0.3326, "shared_votes": 152 }, ...]
 *     }
 *   ]
 * }
 * 
 * Compact format:
 * {
 *   "topics": ["Decolonization", "Development & Economy", ...],
 *   "countries": {
 *     "AFG": {
 *       "dis": [3, 1, 6],      // topic indices for top disagreements with EU
 *       "agr": [9, 4, 0]       // topic indices for top agreements with EU
 *     }
 *   }
 * }
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const inputPath = join(publicDir, 'unga_map_data_topics.json');
const outputPath = join(publicDir, 'unga_topics_compact.json');

// Read input
const input = JSON.parse(readFileSync(inputPath, 'utf-8'));

// Define topics in a fixed order
const TOPICS = [
  "Decolonization",
  "Development & Economy",
  "Environment",
  "Human Rights / Social",
  "International Law & Justice",
  "Middle East (General)",
  "Nuclear / Arms / Disarmament",
  "Palestine / Israel",
  "Peacekeeping & Security",
  "UN Administration"
];

const topicIndex = {};
TOPICS.forEach((t, i) => {
  topicIndex[t] = i;
});

// Build compact output
const compact = {
  topics: TOPICS,
  countries: {}
};

for (const country of input.countries) {
  const code = country.country;
  
  const dis = (country.top_disagreements_eu || []).map(d => topicIndex[d.topic]);
  const agr = (country.top_agreements_eu || []).map(a => topicIndex[a.topic]);
  
  // Only add if we have data
  if (dis.length > 0 || agr.length > 0) {
    compact.countries[code] = {
      dis,
      agr
    };
  }
}

// Write output (no pretty-printing for size)
writeFileSync(outputPath, JSON.stringify(compact));

// Stats
const originalSize = readFileSync(inputPath).length;
const compactSize = readFileSync(outputPath).length;

console.log(`Original: ${(originalSize / 1024).toFixed(1)} KB`);
console.log(`Compact:  ${(compactSize / 1024).toFixed(1)} KB`);
console.log(`Reduction: ${((1 - compactSize / originalSize) * 100).toFixed(1)}%`);
console.log(`Countries: ${Object.keys(compact.countries).length}`);

