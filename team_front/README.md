# Smart Warehouse owner app

A small React + Vite dashboard for checking arrivals, finding parcels and viewing a
simulated seven-day forecast. The app uses plain CSS for its layout and motion.

## Run the app

```sh
npm install
npm run dev
```

Use the Today, Parcels and Forecast tabs to move around. The tab is saved in the URL
hash, and the sun/moon button switches between light and dark colours. The parcel
button adds demo stock so you can try the changing totals, alerts and parcel list.

## Demo data and motion

- Parcel examples, the 10 kg sorting rule and forecast counts are in
  `src/data/mock.js`.
- `src/data/api.js` returns that demo data for now. Replace it with `GET /api/boxes`
  when a real warehouse API is ready.
- The motion durations and easing values are CSS variables in `src/index.css`.
- Motion is reduced automatically when the device asks for reduced motion.
