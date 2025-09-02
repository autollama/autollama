/**
 * Basic test to verify Jest setup is working
 */

describe('Basic Jest Setup', () => {
  test('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should have access to global utilities', () => {
    expect(global.createMockResponse).toBeDefined();
    expect(global.createMockRequest).toBeDefined();
    expect(global.createTestChunk).toBeDefined();
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });
});