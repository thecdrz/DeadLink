let ChartJSNodeCanvas = null;
let Chart = null;
let registerables = null;
try {
  ({ ChartJSNodeCanvas } = require('chartjs-node-canvas'));
  ({ Chart, registerables } = require('chart.js'));
  if (Chart && registerables) {
    // Required in Chart.js v4+ to enable scales/elements/controllers
    Chart.register(...registerables);
  }
} catch (_) {
  // optional dependency not installed; fallback will be used
}

async function renderTrendPng(history) {
  if (!ChartJSNodeCanvas) return null;
  const width = 800, height = 300;
  const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });
  const labels = history.map(h => new Date(h.timestamp).toLocaleTimeString('en-US', { hour12: false }));
  const data = history.map(h => h.count);
  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Players', data, borderColor: '#7289da', fill: false, tension: 0.3 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true } } }
  };
  let buffer = null;
  try {
    buffer = await canvas.renderToBuffer(config);
  } catch (_) {
    return null; // fallback to ASCII if rendering fails
  }
  return buffer;
}

module.exports = { renderTrendPng };
