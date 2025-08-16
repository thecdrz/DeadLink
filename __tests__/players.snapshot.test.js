const { playersListEmbed } = require('../lib/embeds');

describe('players embed snapshot', () => {
  test('playersListEmbed with sample players', () => {
    const players = [
      { name: 'Alice', level: 12, health: 92, kills: 5, deaths: 0, ping: 45, sessionDistance: 120, location: 'Near the central hub', sessionDuration: '15m', streak: 60 },
      { name: 'Bob', level: 5, health: 76, kills: 1, deaths: 2, ping: 120, sessionDistance: 10, location: 'Outskirts', sessionDuration: '5m', streak: 5 }
    ];
  const embed = playersListEmbed({ players });
  // Normalize dynamic footer for deterministic snapshots
  if (embed.footer) embed.footer.text = 'Generated on <fixed>'; 
  expect(embed).toMatchSnapshot();
  });
});
