const embeds = require('../lib/embeds');
const UI = require('../lib/uiConstants');

test('playersListEmbed uses configured UI icons', () => {
  const embed = embeds.playersListEmbed({ players: [{ name: 'Test', level: 1, health: '50%', kills: 3, deaths: 1, ping: 55, sessionDistance: 100, streak: 12, location: 'the farm' }] });
  expect(embed.fields).toBeDefined();
  const field = embed.fields[0];
  expect(field.value).toContain(UI.ICON_KILLS);
  expect(field.value).toContain(UI.ICON_DEATHS);
  expect(field.value).toContain(UI.ICON_DISTANCE);
  expect(field.value).toContain(UI.ICON_STREAK);
});

