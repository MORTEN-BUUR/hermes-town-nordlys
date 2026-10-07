# Runtime sprite atlases

These original sprite atlases were created for Hermes Town and are shipped as runtime assets under the repository's MIT License.

The files are sprite sheets rather than flattened screenshots. Layout, collisions, residents, workstations, lighting, particles, and lifecycle behavior are implemented in TypeScript.

## Files

- `buildings.png`: seven work buildings plus the cottage family.
- `vegetation.png`: trees, saplings, and shrubs.
- `props.png`: fountain, chapel, market stalls, bridge, rocks, lamp, and cart.
- `furniture.png`: benches, planters, storage, signs, graves, fences, walls, stairs, and banners.
- `equipment.png`: anvil, workbench, lectern, telescope, post box, desk, serving table, and crops.

The source sheets use a reserved magenta chroma key in empty regions. `src/art/reference.ts` defines the authored source rectangles, removes the key, trims each region, downsamples it to the runtime pixel density, and preserves alpha. The source PNGs remain unchanged.

Residents are drawn in code at the same pixel density so identity colors and lifecycle animation frames remain deterministic.

## Nordlys pictures

`nordlys/` holds pictures from the Nordlys datacenter / Norway AI project: place pictures (`places/`), the campus overview (`campus.jpg`), team portraits used as session avatars (`staff/`, numbered as on the owner's portrait sheet), and Ella the campus dog (`ella.jpg`). They are resized copies of the project owner's originals, used for the Nordlys theme only. Unlike the sprite atlases above, they are not offered under the MIT License; ask the owner before reusing them elsewhere.
