# Increff migration adapter

The Increff prototype keeps `_assets/data/demo-script.json`, routes, page functions, talking points, and trailer metadata. ScreenReel supplies the runtime and Studio through vendored `dist/projector` assets.

Mount the existing topbar presentation button with:

```js
await ScreenReel.ready;

await ScreenReel.mount(document.querySelector('[data-action="toggle-demo"]'), {
  projectId: 'increff-ms',
  flow: { src: '_assets/data/demo-script.json' },
  activationQueryParam: 'demo',
  legacyStorage: {
    id: 'ms-demo-v1',
    flowsKey: 'ms_demo_flows_v1',
    activeFlowKey: 'ms_demo_active_flow_v1',
    notesVisibleKey: 'ms_demo_notes_visible_v1',
    enabledKey: 'ms_demo',
    session: {
      positionKey: 'ms_demo_pos',
      playingKey: 'ms_demo_playing',
      navigationKey: 'ms_demo_nav_guard'
    }
  }
});
```

Migration copies values only when the destination key is absent, records `screenreel:increff-ms:migration:v1`, and never deletes the legacy keys. Keep the old implementation available for one rollback checkpoint. Trailer capture must continue reading the checked-in canonical script and must not read browser-local flows.
