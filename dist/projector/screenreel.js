(function screenReelLoader() {
  if (window.ScreenReel?.ready) return;
  const script = document.currentScript;
  const configuredBase = script?.dataset.assetBase;
  const assetBase = new URL(configuredBase || './', script?.src || location.href).href;
  const loadScript = (name) => new Promise((resolve, reject) => {
    const node = document.createElement('script'); node.src = new URL(name, assetBase).href; node.onload = resolve; node.onerror = () => reject(new Error(`Unable to load ${name}`)); document.head.appendChild(node);
  });
  const ready = (async () => {
    await loadScript('action-runtime.js'); await loadScript('flow-store.js');
    const module = await import(new URL('projector.js', assetBase).href);
    const api = module.createPublicApi(assetBase); window.ScreenReel = api; return api;
  })();
  window.ScreenReel = { ready, mount: (...args) => ready.then((api) => api.mount(...args)), openStudio: (...args) => ready.then((api) => api.openStudio(...args)) };
})();
