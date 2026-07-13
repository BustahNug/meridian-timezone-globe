# Meridian Timezone Globe

An interactive world-time app built around a draggable 3D globe. Pin cities to a live world clock, compare times across zones with a visual time converter, and explore how daylight moves around the planet in real time.

## Features

- **3D globe** — spin, zoom, and click city markers to pin or unpin locations; US states are colored by time zone with a matching legend
- **World clock** — pinnable city list with live local times, UTC offsets, and sun/moon indicators for day vs. night
- **Time converter** — set a reference date and time in your home city, then drag markers on 24-hour bars to see that moment everywhere else
- **Search** — find cities, countries, states, addresses, or zip codes via live geocoding, with an offline city database as fallback
- **US zones preset** — one-click switch between world cities and a four-city Pacific → Eastern spread
- **Themes** — six page themes (including Night and Light), persisted in the browser
- **Languages** — UI available in 18 languages
- **Day/night visualization** — real-time night shading on the globe, plus day/night cues on clock rows and converter bars
- **Color-vision modes** — alternate map and accent palettes for protanopia, deuteranopia, tritanopia, and monochromacy

## Tech

Vanilla JavaScript — no frameworks and no build step. The globe uses **Three.js** (CDN) with a hand-painted canvas texture; map geometry comes from TopoJSON via CDN. All timezone math runs through the browser's native **Intl** API. City data and translations ship as plain `.js` files loaded by `index.html`.

## Run locally

```bash
git clone <your-repo-url>
cd meridian-timezone-globe
```

Serve the folder with any static file server, then open it in a browser:

```bash
npx serve .
# or
python -m http.server
```

A local server is required so geocoding and map data fetches work correctly.

## Live site

[https://meridianzones.netlify.app](https://meridianzones.netlify.app)
