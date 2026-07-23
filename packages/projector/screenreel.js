(function screenReelLoader() {
  if (window.ScreenReel?.ready) return;
  const script = document.currentScript;
  const configuredBase = script?.dataset.assetBase;
  const assetBase = new URL(configuredBase || './', script?.src || location.href).href;
  const assetVersion = new URL(script?.src || location.href).search;
  const assetUrl = (name) => {
    const url = new URL(name, assetBase);
    if (assetVersion) url.search = assetVersion;
    return url.href;
  };
  const loadScript = (name) => new Promise((resolve, reject) => {
    const node = document.createElement('script'); node.src = assetUrl(name); node.onload = resolve; node.onerror = () => reject(new Error(`Unable to load ${name}`)); document.head.appendChild(node);
  });
  const ready = (async () => {
    await loadScript('action-runtime.js'); await loadScript('flow-store.js');
    const module = await import(assetUrl('projector.js'));
    const api = module.createPublicApi(assetBase, assetVersion); api.ready = ready; window.ScreenReel = api; return api;
  })();
  window.ScreenReel = { ready, mount: (...args) => ready.then((api) => api.mount(...args)), openStudio: (...args) => ready.then((api) => api.openStudio(...args)), registerFn: (...args) => ready.then((api) => api.registerFn(...args)), unregisterFn: (...args) => ready.then((api) => api.unregisterFn(...args)), validateScene: (...args) => ready.then((api) => api.validateScene(...args)) };
})();
