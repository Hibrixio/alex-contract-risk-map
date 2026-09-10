/* Coordinates are derived from the uploaded source, never from guessed bands. */
(function (root) {
  const normalized = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  function indexItems(items) {
    let text = '';
    const ranges = items.map(item => {
      const start = text.length;
      text += normalized(item.text);
      return { ...item, start, end: text.length };
    });
    return { text, ranges };
  }
  function locate(excerpts, pages) {
    const matches = [];
    for (const page of pages) {
      const indexed = indexItems(page.items || []);
      for (const excerpt of excerpts) {
        const needle = normalized(excerpt);
        if (needle.length < 8) continue;
        let start = indexed.text.indexOf(needle);
        while (start !== -1) {
          const end = start + needle.length;
          const rects = indexed.ranges.filter(item => item.end > start && item.start < end).map(item => {
            const [x,y,w,h] = item.rect;
            const length = item.end - item.start;
            const left = Math.max(0, start - item.start) / length;
            const right = Math.min(length, end - item.start) / length;
            return [x + w * left, y, w * (right - left), h];
          });
          if (rects.length) matches.push({ page: page.pageNumber, rects, excerpt });
          start = indexed.text.indexOf(needle, end);
        }
      }
    }
    return matches;
  }
  function textRanges(text, excerpts) {
    let clean = '', offsets = [];
    for (let i = 0; i < text.length; i++) {
      const value = normalized(text[i]);
      for (const char of value) { clean += char; offsets.push(i); }
    }
    const ranges = [];
    for (const excerpt of excerpts) {
      const needle = normalized(excerpt);
      if (needle.length < 8) continue;
      let at = clean.indexOf(needle);
      while (at !== -1) {
        ranges.push([offsets[at], offsets[at + needle.length - 1] + 1]);
        at = clean.indexOf(needle, at + needle.length);
      }
    }
    return ranges.sort((a,b) => a[0] - b[0]);
  }
  const engine = { normalized, locate, textRanges };
  root.OrbitSource = engine;
  if (typeof module !== 'undefined') module.exports = engine;
})(typeof window === 'undefined' ? globalThis : window);
