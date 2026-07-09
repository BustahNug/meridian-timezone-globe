# Manual QA Checklist — Meridian Timezone Globe

Run through these cases after any change to search, geocoding, or the offline fallback
(`extractCityCandidates`, `searchLocalCities`, `localSearchWithFallback`,
`extractStateHint`, `geocode`).

---

## Format

Each entry follows this pattern:

```
### [short description]
Input:  <exact string to type in the search box>
Expect: <what the top result should be>
Path:   offline | online | either
Notes:  <anything else worth checking>
Status: PASS | FAIL | UNTESTED
```

Add new cases at the bottom of the relevant section.  
Update `Status` after each test run. If a case fails, note the actual result in `Notes`.

---

## Search / Geocoding

### Full US street address — state in query, ambiguous city name
Input:  `2214 Trieste Trail Adams tn 37010`
Expect: Adams, TN (not Adams, MA or any other state)
Path:   offline (offline fallback; Trieste Trail is not in OSM)
Notes:  "tn" must be detected as a state hint and used to boost TN over MA.
        The zip code (37010) is intentionally ignored — state hint is sufficient.
Status: PASS

### Full US street address — state as suffix abbreviation
Input:  `1656 Ainsdale Dr Roseville, CA`
Expect: Roseville, CA (not Roseville, MI or Roseville, MN)
Path:   offline
Notes:  CA abbreviation must be detected; Roseville, CA has lower population than
        Roseville, MI in some datasets, so without the state hint the wrong one wins.
Status: PASS

### City + full state name
Input:  `Pewaukee, Wisconsin`
Expect: Pewaukee, WI (not Wisconsin Rapids or any other Wisconsin city)
Path:   offline
Notes:  Full state name must be recognized via extractStateHint; "Wisconsin" must also
        still be filtered out as a city-name candidate so it doesn't match random
        Wisconsin cities instead of Pewaukee.  Previous regression: this was fixed when
        US_STATE_NAMES filtering was added.
Status: PASS

### City name only — no state hint
Input:  `Austin`
Expect: Austin, TX (highest-population Austin)
Path:   offline
Notes:  No state hint present; population tiebreaker should apply. Verify the result is
        Austin, TX and not Austin, MN or Austin, AR.
Status: UNTESTED

### City + country
Input:  `Paris, France`
Expect: Paris, Île-de-France, France (not Paris, TX)
Path:   offline
Notes:  Country name should outrank the US city in scoring.
Status: UNTESTED

### Live geocoding — full street address with internet access
Input:  `1600 Pennsylvania Avenue NW Washington DC`
Expect: The White House / 1600 Pennsylvania Ave NW, Washington, DC
Path:   online (Photon → Nominatim fallback)
Notes:  This tests whether Photon/Nominatim are reachable from a normal browser.
        If live geocoding fails (network/CORS issue), the app should fall back to the
        offline city list and return Washington, DC.  Record actual result here.
        Last tested: UNTESTED — update with result + browser/environment after first run.
Status: UNTESTED

### Zip code only
Input:  `90210`
Expect: Beverly Hills, CA (or nearby city) — NOT an error or blank result
Path:   offline
Notes:  Zip codes are not looked up directly; the offline fallback should gracefully
        return nothing (empty) or the nearest city if a name match is found.
        Verify the app does not crash or show a JS error.
Status: UNTESTED

---

## UI Regression Checks

These don't require testing every language — run in English unless the change touched i18n.

### Language switching
Action: Switch language dropdown to Spanish, then back to English.
Expect: All UI labels (search placeholder, pin button, world clock title, footer) update
        correctly in each language. No JS console errors.
Status: UNTESTED

### Theme switching
Action: Cycle through all 6 themes (Dark Phthalo → Light → Midnight Blue → Sunset →
        Nordic → High Contrast) and back.
Expect: Colors update on every visible element. Globe ocean/zone colors do NOT change.
        Reload page in each theme to confirm localStorage persistence.
Status: UNTESTED

### World Clock click-to-fly
Action: Pin a city, then click its row in the World Clock panel (not the × button,
        not the drag handle).
Expect: Globe flies to that city. Tooltip appears. × button and drag still work
        independently without triggering the fly animation.
Status: UNTESTED

### Result card close button
Action: Search for a city, select a result (card appears). Click the × in the card's
        top-right corner.
Expect: Card disappears. Search input and globe position are unchanged. Searching again
        shows a fresh card normally.
Status: UNTESTED

---

## Adding New Cases

Copy the template at the top of this file and append to the relevant section.
Include enough detail that either of us can reproduce the test cold.
