'use strict';

import { computeDayStatus } from './dayStatus';

// 2025-05-02 = Friday
// 2025-05-03 = Saturday
// 2025-05-04 = Sunday
// 2025-05-05 = Monday

describe('computeDayStatus', () => {
  describe('weekend detection', () => {
    it('returns "weekend" for Friday', () => {
      expect(computeDayStatus('2025-05-02', [], null)).toBe('weekend');
    });

    it('returns "weekend" for Saturday', () => {
      expect(computeDayStatus('2025-05-03', [], null)).toBe('weekend');
    });

    it('does not return "weekend" for Sunday', () => {
      expect(computeDayStatus('2025-05-04', [], null)).not.toBe('weekend');
    });
  });

  describe('missing', () => {
    it('returns "missing" when no entries and no absence', () => {
      expect(computeDayStatus('2025-05-05', [], null)).toBe('missing');
    });

    it('returns "missing" when entries array is empty and absence is null', () => {
      expect(computeDayStatus('2025-05-05', [], null)).toBe('missing');
    });
  });

  describe('full', () => {
    it('returns "full" when absence is present and no entries', () => {
      const absence = { id: 1, type: 'חופשה', start_date: '2025-05-05', end_date: '2025-05-05' };
      expect(computeDayStatus('2025-05-05', [], absence)).toBe('full');
    });

    it('returns "full" when entries sum exactly to 9 hours', () => {
      const entries = [
        { start_time: '09:00:00', end_time: '18:00:00' }, // 9h
      ];
      expect(computeDayStatus('2025-05-05', entries, null)).toBe('full');
    });

    it('returns "full" when multiple entries sum exactly to 9 hours', () => {
      const entries = [
        { start_time: '09:00:00', end_time: '13:00:00' }, // 4h
        { start_time: '14:00:00', end_time: '19:00:00' }, // 5h
      ];
      expect(computeDayStatus('2025-05-05', entries, null)).toBe('full');
    });
  });

  describe('exceptional', () => {
    it('returns "exceptional" when entries sum to 8 hours (no absence)', () => {
      const entries = [
        { start_time: '09:00:00', end_time: '17:00:00' }, // 8h
      ];
      expect(computeDayStatus('2025-05-05', entries, null)).toBe('exceptional');
    });

    it('returns "exceptional" when entries sum to 10 hours (no absence)', () => {
      const entries = [
        { start_time: '08:00:00', end_time: '18:00:00' }, // 10h
      ];
      expect(computeDayStatus('2025-05-05', entries, null)).toBe('exceptional');
    });

    it('returns "exceptional" when entries sum to less than 9 hours with HH:MM format', () => {
      const entries = [
        { start_time: '09:00', end_time: '16:30' }, // 7.5h
      ];
      expect(computeDayStatus('2025-05-05', entries, null)).toBe('exceptional');
    });
  });
});
