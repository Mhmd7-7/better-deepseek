/* Close only the isolated test browser at port 9228, never user profiles/tabs. */
(async () => {
  const version = await (await fetch('http://127.0.0.1:9228/json/version')).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  const timer = setTimeout(() => { socket.close(); process.exitCode = 1; }, 5000);
  socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })));
  socket.addEventListener('close', () => { clearTimeout(timer); console.log('Isolated browser closed.'); });
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
