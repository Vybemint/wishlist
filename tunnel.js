const localtunnel = require('localtunnel');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 3001 });
    console.log(`[TUNNEL_URL]: ${tunnel.url}`);
    
    tunnel.on('close', () => {
      console.log('tunnel closed');
    });
  } catch (err) {
    console.error('Error starting tunnel:', err);
  }
})();
