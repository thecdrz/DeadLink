// A small local replica of the buffering behavior used in index.js
function makeLineBuffer(onLine) {
  let buf = '';
  return {
    push(chunk) {
      const s = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk || '');
      buf += s;
      const parts = buf.split(/\r?\n/);
      const hasTerminalNewline = /\r?\n$/.test(buf);
      buf = hasTerminalNewline ? '' : (parts.pop() || '');
      for (const raw of parts) {
        const line = (raw || '').trim();
        if (!line) continue;
        onLine(line);
      }
    },
    flush() {
      if (buf.trim()) onLine(buf.trim());
      buf = '';
    }
  };
}

describe('telnet line buffering', () => {
  test('joins partial chunks into one full line', () => {
    const lines = [];
    const lb = makeLineBuffer((l) => lines.push(l));
    lb.push("2025-08-13T01:53:40 356964.813 INF GMSG: Player 'CDRZ' joined t");
    lb.push("he game\n");
    expect(lines).toEqual(["2025-08-13T01:53:40 356964.813 INF GMSG: Player 'CDRZ' joined the game"]);
  });

  test('handles multiple lines in one chunk', () => {
    const lines = [];
    const lb = makeLineBuffer((l) => lines.push(l));
    lb.push("A\nB\nC\n");
    expect(lines).toEqual(["A","B","C"]);
  });

  test('keeps trailing partial until next chunk', () => {
    const lines = [];
    const lb = makeLineBuffer((l) => lines.push(l));
    lb.push("Line one\nPartial");
    expect(lines).toEqual(["Line one"]);
    lb.push(" tail\n");
    expect(lines).toEqual(["Line one","Partial tail"]);
  });
});
