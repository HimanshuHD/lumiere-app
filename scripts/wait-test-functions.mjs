const deadline = Date.now() + 90_000;
while (true) {
  const response = await fetch('http://127.0.0.1:55321/functions/v1/finalize-user-document-upload', { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (response?.status === 401) break;
  if (Date.now() > deadline) throw new Error('Local upload function did not become ready. Check the local function runtime.');
  await new Promise(resolve => setTimeout(resolve, 500));
}
console.log('Local upload function is ready.');
