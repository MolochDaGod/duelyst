# Changelog

Card catalog changes for `catalog/badbudz.json` (BadBudz) and `catalog/catalog.json`
(GrudaWars heroes and city PVE). The version is the `catalogVersion` field at the top of
each file. It comes from `lab/catalog-version.mjs`, so `build-badbudz.mjs` and
`bake-duelyst-site.mjs` keep stamping it when they regenerate the files.

## 2026-10-06

- Added `catalogVersion: "2026-10-06"` to `catalog/badbudz.json` and `catalog/catalog.json`.
- **These catalog stats are the single master copy.** Cost, attack, health, rarity, names and
  abilities for the 59 BadBudz cards must be read as published here by the Dope-Budz
  wallet/API, Spawn THC Da Streetz, Battle and any other consumer. No consumer may re-derive
  or rebalance them in code (the wallet's `balanceCanonicalStats` curve is being removed).
  Decided by Jonathan Emmons on 2026-10-06.
- No card data changed. Apart from the new `catalogVersion` key, both files are identical to
  the 2026-09-01 build (`badbudz.json` sha256 before this change:
  `a7258b7046616aeb85c142543b258241a2e395c81a2e826a1d61d45e630b99cb`).
- GrudaWars heroes in `catalog.json` still carry no stats. Consumers derive them with the
  original (pre-2026-09-21) Codex play mapper. If they should become catalog-owned, add them
  here under a new `catalogVersion`.
