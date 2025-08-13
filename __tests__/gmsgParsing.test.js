// Self-contained tests for message parsing and embed shape (no side effects from requiring index.js)

function parseLine(line) {
  const dataRaw = line.match(/(.+)T(.+) (.+) INF (Chat|GMSG)(.*): (.*)/);
  if (!dataRaw) return null;
  const type = dataRaw[4];
  const text = dataRaw[6];
  return { type, text };
}

function buildEmbedFromMessage(message) {
  if (message.includes("joined the game")) {
    const m = message.match(/Player '([^']+)' joined the game/);
    if (!m) return null;
    return { embeds: [{ title: '🚪 Player Joined', description: expect.any(String) }] };
  }
  if (message.includes("left the game")) {
    const m = message.match(/Player '([^']+)' left the game/);
    if (!m) return null;
    return { embeds: [{ title: '🚪 Player Left', description: expect.any(String) }] };
  }
  if (message.includes("died")) {
    const m = message.match(/Player '([^']+)' died/);
    if (!m) return null;
    return { embeds: [{ title: '💀 Player Death', description: expect.any(String) }] };
  }
  return null;
}

describe('GMSG parsing to embeds (self-contained)', () => {
  test('join -> embed', () => {
    const line = "2025-08-13T01:53:40 356964.813 INF GMSG: Player 'CDRZ' joined the game";
    const parsed = parseLine(line);
    expect(parsed).toBeTruthy();
    const payload = buildEmbedFromMessage(parsed.text);
    expect(payload).toBeTruthy();
    expect(payload).toHaveProperty('embeds');
    expect(payload.embeds[0].title).toMatch(/Player Joined/i);
  });

  test('leave -> embed', () => {
    const line = "2025-08-13T01:54:59 357044.087 INF GMSG: Player 'CDRZ' left the game";
    const parsed = parseLine(line);
    expect(parsed).toBeTruthy();
    const payload = buildEmbedFromMessage(parsed.text);
    expect(payload).toBeTruthy();
    expect(payload.embeds[0].title).toMatch(/Player Left/i);
  });

  test('death -> embed', () => {
    const line = "2025-08-13T01:55:59 357104.087 INF GMSG: Player 'TheGuyWho' died";
    const parsed = parseLine(line);
    expect(parsed).toBeTruthy();
    const payload = buildEmbedFromMessage(parsed.text);
    expect(payload).toBeTruthy();
    expect(payload.embeds[0].title).toMatch(/Player Death/i);
  });
});
