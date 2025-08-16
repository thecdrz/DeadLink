const { dashboardEmbed, legendField } = require('../lib/embeds');

describe('embeds snapshot', () => {
  test('dashboardEmbed with legend remains stable', () => {
    const connFmt = { emoji: '🟢', text: 'Online' };
    const discordFmt = { emoji: '🟢', text: 'Online' };
    const embed = dashboardEmbed({ connFmt, discordFmt, modeMsg: 'Dev', version: '9.9.9' });
    // Ensure legend is appended (as the UI uses)
    embed.fields = embed.fields || [];
    embed.fields.push(legendField());
    expect(embed).toMatchSnapshot();
  });
});
