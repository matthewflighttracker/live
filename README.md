# Flight Tracker

This folder is ready for GitHub Pages.

## Google Sheet columns
Use these headers in row 1:
`id, date, from_airport, to_airport, flight_code, airline, airplane, registration, who`

## What the site does
- Loads flights from your SheetDB-backed Google Sheet
- Auto-picks the next ID when adding a flight
- Lets you add, edit, and delete flights
- Filters by year, airline, who, airports, airplane, and flight code
- Searches registrations flexibly, so `gwuky`, `g-wuky`, and `G-WUKY` all match `G-WUKY`
- Adds iPhone home-screen support with standalone app metadata and icons
- Keeps the same iPhone-friendly bubbly UI

## New home-screen assets
Use these filenames in the repo:
- `apple-touch-icon.png` — 180×180
- `icon-192.png` — 192×192
- `icon-512.png` — 512×512

## Publish
Upload these files to your GitHub repository and enable GitHub Pages:
- `index.html`
- `styles.css`
- `script.js`
- `manifest.webmanifest`
- `sw.js`
- `apple-touch-icon.png`
- `icon-192.png`
- `icon-512.png`
- `logo.svg`
