import { getDatabase } from './src/db/database.js';

const db = getDatabase();

// Get a sample from history
const sample = db.prepare(`
  SELECT id, stops_json, route_data_json
  FROM history
  LIMIT 1
`).get();

if (sample) {
  console.log('=== STOPS_JSON (输入) ===');
  const stops = JSON.parse(sample.stops_json);
  stops.forEach((stop, index) => {
    console.log(`\nStop ${index}:`);
    console.log('  name:', stop.name);
    console.log('  original:', stop.original);
  });

  console.log('\n\n=== ROUTE_DATA_JSON (Google Maps 返回的) ===');
  const route = JSON.parse(sample.route_data_json);
  if (route.stops) {
    route.stops.forEach((stop, index) => {
      console.log(`\nStop ${index}:`);
      console.log('  Fields:', Object.keys(stop));
      console.log('  name:', stop.name);
      console.log('  formattedAddress:', stop.formattedAddress);
      console.log('  lat/lng:', stop.lat, stop.lng);
    });
  } else {
    console.log('No stops in route data!');
  }
} else {
  console.log('No history entries found. Create a route first!');
}
