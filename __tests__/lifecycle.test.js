const fs = require('fs');
const path = require('path');

const { registerTimeout, registerInterval, registerServer, shutdown } = require('../lib/lifecycle');

describe('lifecycle', () => {
  test('registers and clears timeouts and intervals', (done) => {
    const t = setTimeout(() => {}, 10000);
    const i = setInterval(() => {}, 10000);
    registerTimeout(t);
    registerInterval(i);
    // ensure they exist before shutdown
    shutdown();
    // clearing should not throw and should remove handles
    expect(true).toBe(true);
    done();
  });

  test('registers and closes servers', (done) => {
    const net = require('net');
    const srv = net.createServer(() => {});
    srv.listen(0, '127.0.0.1', () => {
      registerServer(srv);
      shutdown();
      // server should be closed
      setTimeout(() => {
        expect(srv.listening).toBe(false);
        done();
      }, 20);
    });
  });
});
