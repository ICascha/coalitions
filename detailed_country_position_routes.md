# Detailed Country Position Analytics Routes

The `country_position_index_detailed.json` file extends the standard index by adding granular "dimension scores" for each proposal. These dimensions capture specific policy axes (e.g., "Fiscal Rules Reform", "Ukraine Support") relevant to that proposal.

The API exposes two new routes to access this detailed data.

> **Data source:** By default the API loads `country_position_index_detailed.json` from the project root. Override this by setting `COUNTRY_POSITION_INDEX_DETAILED_PATH=/path/to/file.json` before starting Uvicorn.

## POST `/country-positions/detailed/disagreement`
- **Purpose:** Compare two disjoint sets of countries (Set A vs Set B) on the same collection of proposals, returning detailed dimension scores for each country.
- **Required filters:** You must provide at least one of `topic` or `council`.
- **Request body fields:**
  - `set_a`, `set_b` *(arrays of strings)* – Country names.
  - `topic` *(string, optional)* – Topic label (case-insensitive).
  - `council` *(string, optional)* – Council name (case-insensitive).
- **Response fields:**
  - Same top-level structure as the standard disagreement route (`topic`, `council`, `total_proposals`, etc.).
  - `results` – Sorted list (largest disagreement first). Each entry now includes:
    - `dimensions` – List of dimension definitions for the proposal:
      - `short_name`, `description`, `negative_pole`, `positive_pole`.
    - `set_a_positions`, `set_b_positions` – Each position entry now includes:
      - `dimension_scores` – List of `{dimension, score}` objects, where `score` is a float (typically -1.0 to 1.0).
- **Example:**

```bash
curl -X POST http://localhost:8000/country-positions/detailed/disagreement \
     -H "Content-Type: application/json" \
     -d '{
           "set_a": ["Germany", "France"],
           "set_b": ["Poland", "Hungary"],
           "topic": "Agriculture & Food Systems"
         }'
```

## POST `/country-positions/detailed/variance`
- **Purpose:** Inspect the spread of opinions within a single set of countries, including detailed dimension scores.
- **Required filters:** Supply `topic` or `council` (or both).
- **Request body fields:**
  - `set_a` *(array of strings)* – Countries to analyze.
  - `topic`, `council` *(strings, optional)*.
- **Response fields:**
  - Same top-level structure as the standard variance route.
  - `results` – Ordered by variance. Each entry includes:
    - `dimensions` – List of dimension definitions.
    - `country_positions` – List of positions, each including `dimension_scores`.
- **Example:**

```bash
curl -X POST http://localhost:8000/country-positions/detailed/variance \
     -H "Content-Type: application/json" \
     -d '{
           "set_a": ["Germany", "France", "Italy", "Spain"],
           "council": "Agriculture and Fisheries Council"
         }'
```

## Data Models

### Dimension Definition
Describes a specific policy axis for a proposal.
```json
{
  "short_name": "Ukraine Support",
  "description": "Commitment to swiftly adopt the MFF review...",
  "negative_pole": "Hesitant or ad-hoc support...",
  "positive_pole": "Urgent adoption..."
}
```

### Dimension Score
A country's score on a specific dimension.
```json
{
  "dimension": "Ukraine Support",
  "score": 0.95
}
```
