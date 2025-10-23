# Data Pipeline Overview

This note captures how each JSON output in the project is produced and where the underlying data comes from. The goal is to keep the description simple and in plain language so it’s easy to revisit the pipeline later.

## `spotify.json`
- **Source**: [`https://www.kaggle.com/datasets/asaniczka/top-spotify-songs-in-73-countries-daily-updated`](https://www.kaggle.com/datasets/asaniczka/top-spotify-songs-in-73-countries-daily-updated)
- **Computation**: The pipeline reshapes the Kaggle playlist snapshots into country-to-country overlap scores. For each pair of European countries it counts how many tracks they both have in the daily rankings, normalizes by the number of songs in each country’s list, and stores a symmetric similarity metric for the pair.

## `energy_grid.json`
- **Source**: [`https://ember-energy.org/data/europe-electricity-interconnection-data/`](https://ember-energy.org/data/europe-electricity-interconnection-data/)
- **Computation**: Starting from Ember’s interconnector capacities, the script keeps the European grid connections, converts the net transfer capacities into comparable units, and averages directional values so each country pair ends up with a single harmonic-mean interconnection score.

## `trade.json`
- **Source**: [`https://comtradeplus.un.org/TradeFlow?Frequency=A&Flows=X&CommodityCodes=TOTAL&Partners=8,20,40,831,56,70,100,191,196,203,208,233,234,246,251,276,292,300,348,352,833,380,832,428,438,440,442,470,498,492,499,528,807,578,616,620,372,642,674,688,703,705,724,744,752,756,792,804,826,336,248&period=2024&AggregateBy=none&BreakdownMode=plus`](https://comtradeplus.un.org/TradeFlow?Frequency=A&Flows=X&CommodityCodes=TOTAL&Partners=8,20,40,831,56,70,100,191,196,203,208,233,234,246,251,276,292,300,348,352,833,380,832,428,438,440,442,470,498,492,499,528,807,578,616,620,372,642,674,688,703,705,724,744,752,756,792,804,826,336,248&period=2024&AggregateBy=none&BreakdownMode=plus)
- **Computation**: The script sums 2024 export values for every reporter–partner pair, then divides each bilateral figure by the reporter’s total exports to get a share. It combines the two shares (A→B and B→A) using the harmonic mean so every country pair has a single symmetric trade intensity metric.

## `investments.json`
- **Source**: [`https://data.imf.org/en/datasets/IMF.STA%3ADIP`](https://data.imf.org/en/datasets/IMF.STA%3ADIP)
- **Computation**: Using the IMF outward direct investment positions, the converter keeps European reporting and partner countries, rescales the amounts into dollars, and normalizes each flow by the investor’s total outward stock. It then harmonically averages the two directions so each European pair has one symmetric investment linkage score.

## `migration.json`
- **Source**: [`https://www.un.org/development/desa/pd/content/international-migrant-stock`](https://www.un.org/development/desa/pd/content/international-migrant-stock)
- **Computation**: The pipeline reads the 2024 UN DESA migration stock table, adds the male and female counts, and filters to European origin/destination codes. For every origin–destination pair it sums the migrants, normalizes by the origin country’s total emigrants, and applies a harmonic mean with the reverse direction to produce a balanced migration linkage metric.

---

Each JSON file therefore represents a symmetric relationship matrix for European countries, with values scaled to the share or intensity of the originating country and harmonized across directions.
