import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractUsgaRatingTable,
  loadUsgaRatingTable,
} from '../services/usgaRatingLookup';

const page = `
  <html><body>
    <table><tr><td>Course Rating Search Results</td></tr></table>
    <table id="gvTee">
      <thead><tr><th>Tee Name</th><th>Gender</th><th>Par</th><th>Course Rating™</th><th>Slope Rating®</th><th>Front (9)</th><th>Back (9)</th></tr></thead>
      <tbody>
        <tr><td>Blue</td><td>M</td><td>72</td><td>71.6</td><td>126</td><td>35.8 / 130</td><td>35.8 / 121</td></tr>
        <tr><td>Red</td><td>F</td><td>72</td><td>73.4</td><td>130</td><td>36.7 / 128</td><td>36.7 / 132</td></tr>
      </tbody>
    </table>
  </body></html>`;

afterEach(() => vi.unstubAllGlobals());

describe('USGA CourseID lookup', () => {
  it('extracts the rating table without unrelated page tables', () => {
    expect(extractUsgaRatingTable(page)).toBe([
      'Tee Name\tGender\tPar\tCourse Rating™\tSlope Rating®\tFront (9)\tBack (9)',
      'Blue\tM\t72\t71.6\t126\t35.8 / 130\t35.8 / 121',
      'Red\tF\t72\t73.4\t130\t36.7 / 128\t36.7 / 132',
    ].join('\n'));
  });

  it('fetches only the fixed USGA CourseID URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(page, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadUsgaRatingTable(9970);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ncrdb.usga.org/courseTeeInfo?CourseID=9970',
      expect.objectContaining({ headers: { Accept: 'text/html' } }),
    );
    expect(result.tableText).toContain('Blue\tM\t72');
  });

  it('reports blocked or unreadable upstream pages instead of returning empty ratings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    await expect(loadUsgaRatingTable(9970)).rejects.toThrow(/blocked.*403/i);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Access Denied', { status: 200 })));
    await expect(loadUsgaRatingTable(9970)).rejects.toThrow(/readable tee rating table/i);
    await expect(loadUsgaRatingTable(Number.NaN)).rejects.toThrow(/valid USGA Course ID/i);
  });
});
