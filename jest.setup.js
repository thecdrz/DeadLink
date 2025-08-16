// Fixed timestamp for deterministic snapshots
const FIXED_TS = new Date('2025-08-16T12:00:00.000Z').getTime();

// Mock Date.now
jest.spyOn(Date, 'now').mockImplementation(() => FIXED_TS);

// Normalize toLocaleDateString and toLocaleTimeString to fixed outputs
const fixedDate = new Date(FIXED_TS);
const fixedDateStr = fixedDate.toLocaleDateString('en-US');
const fixedTimeStr = fixedDate.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
// Override prototype methods used by embeds
Date.prototype.toLocaleDateString = function() { return fixedDateStr; };
Date.prototype.toLocaleTimeString = function() { return fixedTimeStr; };
