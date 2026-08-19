// Side-effect imports: each registers its namespace with `defineDict()` and
// augments `DictRegistry` the moment this barrel is imported. Import this
// module (not the individual `*.dict.ts` files) from anything that needs
// `getDict()` or the `DictRegistry` type, so registration always happens
// before lookup.
import "./app.dict"
import "./models.dict"
import "./tools.dict"
import "./appearanceEditor.dict"
import "./narration.dict"

export { defineDict, getDict } from "./defineDict"
export type { Dict, DictEntry, DictHandle } from "./defineDict"
export type { DictRegistry } from "./registry"
