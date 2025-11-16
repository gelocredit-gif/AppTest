# Amazon Launch Viability Checker

A lightweight single-page React + TypeScript app that simulates Amazon FBA launch viability using simple assumptions. Fill in the product, budget, and competition details, then run a quick calculation to see risk, unit economics, and three launch scenarios.

## Getting started

```bash
npm install
npm run dev
```

The app uses Vite. After starting the dev server, open the printed local URL in your browser. A production bundle can be created with `npm run build`.

## Features
- Multi-section form with validation to prevent negative values.
- Uses saved values from `localStorage` so you can return to previous inputs.
- Calculates Amazon fees, gross profit, ad costs, and month-by-month cash for Safe/Base/Aggressive scenarios.
- Clear verdict badge (Green/Amber/Red) with a summary sentence and scenario table.
- Minimal styling with a clean, responsive layout.

## Notes
- All assumptions (fees, CPC, conversion rates) live in `src/App.tsx` for quick tweaking.
- No backend or external APIs are required.
- This simulation is simplified and not financial advice.
