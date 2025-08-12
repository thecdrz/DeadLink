const { calculateActivityLevel, calculateConsistency } = require('../lib/analyticsUtils');

describe('analyticsUtils', () => {
  test('calculateActivityLevel computes average and level', () => {
    const data = [
      { timestamp: 1, count: 0 },
      { timestamp: 2, count: 2 },
      { timestamp: 3, count: 5 }
    ];
    const res = calculateActivityLevel(data);
    expect(res.avg).toBeCloseTo((0+2+5)/3, 1);
    expect(['Low','Moderate','High']).toContain(res.level);
    expect(res.max).toBe(5);
  });

  test('calculateConsistency classifies variability', () => {
    const lowVar = Array.from({length: 10}, (_,i)=>({timestamp:i,count:5}));
    const highVar = [0,5,10,0,9,1,12].map((c,i)=>({timestamp:i,count:c}));
    expect(calculateConsistency(lowVar)).toMatch(/consistent/i);
    expect(calculateConsistency(highVar)).toMatch(/variable/i);
  });
});
