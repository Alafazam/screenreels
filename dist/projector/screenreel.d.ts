export interface ScreenReelManifest { schemaVersion: 1; flows: ScreenReelFlow[] }
export interface ScreenReelFlow { id: string; name: string; defaults?: Record<string, unknown>; scenes: ScreenReelScene[] }
export interface ScreenReelScene { id: string; enabled?: boolean; route: string; title?: string; talkingPoints?: string; waitFor?: string; settleMs?: number; dwellMs?: number; leadInMs?: number; tailMs?: number; endsInNavigation?: boolean; actions: ScreenReelAction[] }
export interface ScreenReelAction { id?: string; type: 'highlight' | 'glow' | 'spotlight' | 'callout' | 'click' | 'hover' | 'focus' | 'type' | 'set' | 'toggle' | 'lever' | 'drag' | 'scrollIntoView' | 'scroll' | 'wait' | 'waitFor' | 'goto' | 'pointer' | 'call' | 'fill'; selector?: string; index?: number; afterMs?: number; [key: string]: unknown }
export interface ScreenReelRouter { getRoute(): string; navigate(route: string): void | Promise<void>; subscribe?(listener: () => void): () => void }
export interface ScreenReelLegacyStorage { id?: string; flowsKey?: string; activeFlowKey?: string; notesVisibleKey?: string; enabledKey?: string; session?: { positionKey?: string; playingKey?: string; navigationKey?: string } }
export interface ScreenReelOptions { projectId: string; flow: { src: string } | { data: ScreenReelManifest }; assetBase?: string; activationQueryParam?: string; notesMode?: 'reserve' | 'overlay'; router?: ScreenReelRouter; legacyStorage?: ScreenReelLegacyStorage }
export interface ScreenReelProjector { enable(): this; disable(): this; play(): Promise<void>; pause(): this; openStudio(options?: Record<string, unknown>): Promise<unknown>; destroy(): void }
export interface ScreenReelApi { mount(target: Element, options: ScreenReelOptions): Promise<ScreenReelProjector>; openStudio(options?: Record<string, unknown>): Promise<unknown> }
declare global { interface Window { ScreenReel: ScreenReelApi & { ready: Promise<ScreenReelApi> } } }
