const { playerDeepDiveEmbed } = require('../lib/embeds');

describe('player deep dive snapshot', () => {
  test('playerDeepDiveEmbed with fields', () => {
    const fields = [
      { name: 'Stats', value: 'Level: 12\n❤️ 92% | ⚔️ 5 kills | ☠️ 0 deaths' },
      { name: 'Session', value: '15m active | 120m traveled' }
    ];
  const embed = playerDeepDiveEmbed({ title: '🎯 Player Deep Dive', fields });
  // Normalize dynamic footer for deterministic snapshots
  if (embed.footer) embed.footer.text = 'Generated on <fixed>';
  expect(embed).toMatchSnapshot();
  });
});
