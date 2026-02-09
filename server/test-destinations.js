import { getRecentDestinations } from './src/services/historyService.js';

// Test with user ID 3 (Maggie - has history)
const destinations = getRecentDestinations(3, 10);

console.log('=== Recent Destinations ===\n');

if (destinations.length === 0) {
  console.log('No destinations found!');
} else {
  destinations.forEach((dest, index) => {
    console.log(`${index + 1}. ${dest.name}`);
    console.log(`   Type: ${dest.type}`);
    console.log(`   Address: ${dest.formattedAddress}`);
    console.log(`   Lat/Lng: ${dest.lat}, ${dest.lng}\n`);
  });
}
