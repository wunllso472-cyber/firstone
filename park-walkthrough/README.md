# Innovation Park Walkthrough

A 3D walkthrough of the innovation park, built with three.js from the phase-one site plan and on-site photos.

Open `index.html` in a browser. There is no build step. It loads three.js 0.160 from jsDelivr.

## Modes

- **Tour** (`1`): 12 guided stops with descriptions. `←` / `→` to step, `Space` to pause. Dragging the view or scrolling hands control to Walk or Aerial.
- **Walk** (`2`): first person at eye height. `WASD` or `↑` / `↓` to move, `←` / `→` or `Q` / `E` to turn, drag to look, `Shift` to run. On touch screens, use the joystick. Buildings and the lake block movement. Pressing a movement key during the tour starts walking from the current stop. Keys also work with a Chinese input method switched on.
- **Aerial** (`3`): drag to orbit, scroll or pinch to zoom, `Shift` or right-drag to pan.

Click the minimap to go to that spot.

## What's modelled

Everything is placed from the site plan at about 0.3 m per plan pixel. Heights come from the plan's floor counts and H= values.

- **A1, A2 R&D clusters**: stepped 3–7 floor blocks with light aluminium curtain walls and roof gardens.
- **A4 information experience center**: four stacked glass rings, each leaning slightly outward, with a green roof and an entrance canopy on two columns.
- **Lake**: three islands, a lotus pond and willows. **A5** stands in the water at the east end.
- **A3 cluster** including the 11-floor tower, plus **B1 / B2**: dark glass with staggered white fins, as in the photos.
- **B3 110 kV substation**, the surface car park with parked cars, the sports courts, rain canopies 1–6, internal roads with the blue cycle lane, and the surrounding roads 光明桥路, 红旗路 and 杨家墩路.

## Trees

Trees are grown procedurally from the species typical of Zhejiang campuses, not placed as generic shapes. Each species has a real trunk and limb structure, leaf cards drawn at runtime, and a gentle wind sway:

- **香樟 camphor**: broad domed crowns of glossy dark leaves. The main tree on lawns and along the service road.
- **垂柳 weeping willow**: leaning trunks with curtains of hanging strands. Planted around the lake.
- **栾树 goldenrain tree**: lighter, more upright crowns. Planted along 红旗路.
- **桂花 osmanthus**: low, dense, two-stemmed.
- **紫薇 crape myrtle**: multi-stemmed, pale bark, pink blossom.
- **水杉 dawn redwood**: narrow cones, mostly in the park to the north.
- **Young staked street trees**: the rows on the central axis, with green support poles as in the photos.
- **Clipped hedges** along the axis and shrubs on the green roofs.

## People

About 40 pedestrians walk the paved paths, each keeping to their side and turning around at the ends. They are jointed figures: a torso, two arms with elbows and hands, and two legs with knees and shoes. A walk cycle swings each leg forward in turn, bends the knee through the swing, counter-swings the arms, and adds a slight bob and hip twist. From the front you can see each face: eyes with irises and pupils, eyelids, eyebrows, nose, lips, ears and hair. Clothes, skin tone, hair style and height vary from person to person.

Textures are all drawn at runtime on canvases. There are no image assets.
