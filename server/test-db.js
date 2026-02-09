import { createOrLoginUser } from './src/services/userService.js';

console.log('Testing database operations...\n');

try {
  // First login (should create user)
  console.log('1. First login with "testuser456":');
  const user1 = createOrLoginUser('testuser456');
  console.log('   Result:', user1);
  console.log('   ✓ Success\n');

  // Second login (should update last_login)
  console.log('2. Second login with same username:');
  const user2 = createOrLoginUser('testuser456');
  console.log('   Result:', user2);
  console.log('   ✓ Success\n');

  console.log('All tests passed!');
} catch (error) {
  console.error('ERROR:', error.message);
  console.error('Stack:', error.stack);
}
