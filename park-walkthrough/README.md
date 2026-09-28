# Innovation Park Walkthrough

A 3D walkthrough of the innovation park, built with three.js from the phase-one site plan and on-site photos.

Open `index.html` in a browser. There is no build step. It loads three.js 0.160 from jsDelivr.

## Modes

- **Tour** (`1`): 12 guided stops with descriptions. `←` / `→` to step, `Space` to pause. Dragging the view or scrolling hands control to Walk or Aerial.
- **Walk** (`2`): first person at eye height. `WASD` or arrow keys to move, drag to look, `Shift` to run. On touch screens, use the joystick. Buildings and the lake block movement.
- **Aerial** (`3`): drag to orbit, scroll or pinch to zoom, `Shift` or right-drag to pan.

Click the minimap to go to that spot.

## What's modelled

Everything is placed from the site plan at about 0.3 m per plan pixel. Heights come from the plan's floor counts and H= values.

- **A1, A2 R&D clusters**: stepped 3–7 floor blocks with light aluminium curtain walls and roof gardens.
- **A4 information experience center**: four stacked glass rings, each leaning slightly outward, with a green roof and an entrance canopy on two columns.
- **Lake**: three islands, a lotus pond and willows. **A5** stands in the water at the east end.
- **A3 cluster** including the 11-floor tower, plus **B1 / B2**: dark glass with staggered white fins, as in the photos.
- **B3 110 kV substation**, the surface car park with parked cars, the sports courts, rain canopies 1–6, internal roads with the blue cycle lane, and the surrounding roads 光明桥路, 红旗路 and 杨家墩路.

Textures are all drawn at runtime on canvases. There are no image assets.
