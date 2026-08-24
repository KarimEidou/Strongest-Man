// Tiny synchronous event bus for discrete cross-cutting facts.
// Hot per-frame paths use direct system calls, never events.
// Listeners must not retain the payload object — it may be reused.
export const EV = {
  FEAT: 'feat',                     // {type, x, z, magnitude}
  SCREAM: 'scream',                 // {x, z, radius}
  NPC_DIED: 'npcDied',              // {npc, cause:'player'|'monster'|'debris'|'thrown', x, z}
  MONSTER_SPAWNED: 'monsterSpawned',// {monster}
  MONSTER_REALIZED: 'monsterRealized', // {monster}
  MONSTER_DIED: 'monsterDied',      // {monster, byPlayer, x, z, nearNpcs}
  KARMA_CHANGED: 'karmaChanged',    // {value, band, prevBand}
  WITNESS: 'witness',               // {npc, featType, magnitude}
  CHUNK_DESTROYED: 'chunkDestroyed',// {building, count, x, y, z}
  BUILDING_COLLAPSED: 'buildingCollapsed', // {building, byPlayer, occupied}
  CAR_EXPLODED: 'carExploded',      // {x, z, byPlayer}
  HYDRANT_BURST: 'hydrantBurst',    // {x, z}
  PROP_DESTROYED: 'propDestroyed',  // {type}
  PLAYER_THREW: 'playerThrew',      // {what:'car'|'npc'|'monster'|'prop'|'debris'}
  GAME_STATE: 'gameState',          // {state:'title'|'playing'|'paused'|'settings'}
  SETTINGS_CHANGED: 'settingsChanged', // {settings}
};

const map = new Map();
export function on(name, fn) {
  let s = map.get(name);
  if (!s) map.set(name, (s = new Set()));
  s.add(fn);
  return () => s.delete(fn);
}
export function emit(name, payload) {
  const s = map.get(name);
  if (s) for (const fn of s) fn(payload);
}
