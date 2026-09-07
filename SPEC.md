# Bedroom 6 — 3-D Room Model: Specification and Test Plan

This document is the single source of truth for what the model in this
repository represents, the rules it must satisfy, and how those rules are
verified. Every rule has an ID. The automated suite (`npm test`) references
the IDs, and the viewer's side panel runs the same `validate()` rules live.

## 1. Purpose

Build an interactive 3-D layout of **Bedroom 6** from the house floor plan so
that furniture placement, clearances and the relationship to the exterior
mechanical area (AC condenser and drain) can be checked before anything is
moved or installed.

## 2. Source

A crop of the architectural floor plan showing:

- **BEDROOM 6 — 11'-1" × 10'-5"** (interior).
- An entry door in the top-left corner of the room, labelled **OPT DOOR**,
  swinging into the room from a hallway beside the stairs.
- A small closet marked **L** (linen) with its door swinging out to the hall,
  whose box takes a bite out of the room's left wall.
- A bifold ("W"-shaped) closet on the top wall, right of the bathroom.
- Two windows side by side on the bottom wall.
- A cross-hatched slab outside the bottom wall with a round symbol in it.
  The user identifies this as the **AC unit and water drainage** area.

Positions were scaled off the crop at roughly 27 px per foot. Anything not
readable from the plan is listed under **Assumptions** (section 7) and must
be confirmed on site.

## 3. Units and coordinate system

- All lengths are in **feet** (decimal). `ft(feet, inches)` in
  `room.config.js` converts feet-inches. Display uses feet-inches (`11'-1"`).
- The plan is mapped onto the model like this:

| Plan | Model | Notes |
| --- | --- | --- |
| left → right | **x** from 0 to `room.width` | |
| top → bottom | **z** from 0 to `room.length` | |
| up | **y** from 0 (floor) to `room.height` | |
| top wall (hall side) | `back` wall, z = 0 | door and closet |
| bottom wall (exterior) | `front` wall, z = length | windows, exterior beyond |
| left wall | `left` wall, x = 0 | linen nook against it |
| right wall | `right` wall, x = width | |

- An opening's `from` is measured along its wall from the plan's **left edge**
  (back/front walls) or **top edge** (left/right walls). `width` continues in
  the same direction.
- A door's `hinge` is `start` (nearer the plan's left/top) or `end`.
- Solids (fixtures, furniture) are axis-aligned boxes: `x`/`z` is the
  back-left corner on the floor, `w` along x, `d` along z, `h` up.
- Exterior items sit beyond one wall (`exterior.side`). `x` is measured like
  `from`; `out` is the distance from that wall's **exterior face**
  (`wallThickness` beyond the interior face).

## 4. Model requirements

| ID | Requirement | Acceptance criteria | Test |
| --- | --- | --- | --- |
| R-00 | The committed `room.config.js` satisfies every rule below. | `validate(config)` returns an empty list. | `spec.test.js` R-00, viewer "Spec check" panel |
| R-01 | Room envelope matches the plan. | width = 11'-1", length = 10'-5" (±1/16"); height > 0 and ≥ 7'-6"; units are feet. | R-01 |
| R-02 | Every opening is on a real wall, within that wall's length, and below the ceiling. | `from ≥ 0`, `from + width ≤ wall length`, `sill ≥ 0`, `sill + height ≤ room.height`. | R-02 |
| R-03 | Openings on the same wall do not overlap. | Along-wall spans are disjoint. | R-03 |
| R-04 | One entry door, on the back wall near the left corner, hinged at the left, swinging into the room; its swing is clear. | Exactly one `door`; `wall = back`; `hinge = start`; `swing = in`; leaf 2'-4" to 3'-0" wide, ≥ 6'-6" tall. No fixture or furniture intersects the quarter-disc swept by the leaf. | R-04 (three tests) |
| R-05 | One bifold closet on the back wall, right of the door, 2 ft deep, with 2 ft of clear floor in front of its opening. | Exactly one `closet`; `wall = back`; `door = bifold`; `depth = 2'-0"`; opening lies inside its alcove; alcove is behind the wall line; no solid within the 2 ft zone in front of the opening. | R-05 (two tests) |
| R-06 | Two windows side by side on the front (exterior) wall; nothing blocks them. | Exactly two `window`s, both `wall = front`, sill 3'-0", width ≥ 2', height ≥ 3', separated by ≤ 1' of mullion. Within 6" of the wall in front of a window: no fixtures, and furniture no taller than the sill. | R-06 (two tests) |
| R-07 | Every solid is inside the room; the linen nook is on the left wall beyond the door swing and runs floor to ceiling. | Rect inside the room outline; `linen.x = 0`, `linen.z ≥ door.width`, `linen.h = room.height`. | R-07 (two tests) |
| R-08 | Solids do not overlap each other. | Pairwise footprint overlap test (touching is allowed). | R-08 |
| R-09 | The exterior pad, AC unit and drain are outside the front wall; the AC unit sits entirely on the pad. | All three footprints have `z ≥ length + wallThickness`; AC rect inside pad rect; drain inside pad. | R-09 |
| R-10 | The AC condenser keeps service clearance from the house. | `ac.out ≥ 1'-0"`. | R-10 |
| R-11 | The drain is on the pad and not under the AC unit. | Drain footprint inside the pad and disjoint from the AC footprint. | R-11 |

Geometry helpers have their own unit tests (G-01 … G-04): wall panel
tiling around openings, wall-frame mapping, feet-inches formatting, and the
rectangle/circle overlap helpers used by the rules above.

## 5. Rendering requirements

| ID | Requirement | Acceptance criteria | Test |
| --- | --- | --- | --- |
| RN-01 | The page loads and builds every modelled element. | No script errors; scene contains 1 door, 2 windows, 1 closet, 1 fixture, 3 furniture, pad, AC, drain, 4 wall groups; ≥ 10 labels; header shows `11'-1" × 10'-5"`; spec check reads "All spec rules pass." | `render.test.js` RN-01 |
| RN-02 | The canvas fills its container on HiDPI displays. | With `devicePixelRatio = 2` the canvas's CSS box equals the `#view` box within 1 px and the drawing buffer is 2× that. (Regression for the "view isn't centred" bug.) | RN-02 |
| RN-03 | The room is centred and fully visible on load. | The room's centre projects within ±0.1 of the viewport centre in normalised device coordinates; all eight room corners project inside the viewport. | RN-03 |
| RN-04 | Walls between the camera and the room are hidden with their doors/windows/labels; from above all four walls show; the top view is oriented like the plan. | From the default camera (+x, +z side) `front` and `right` are hidden, `back` and `left` shown. After "Top view" all four are visible, the back wall is at the top of the screen and the right wall on the right. | RN-04 |
| RN-05 | Editing a dimension in the panel rebuilds the model and re-runs the spec check. | Setting width to 9 changes the floor geometry, updates the header, and surfaces R-02/R-07 violations. | RN-05 |
| RN-06 | Labels can be switched off and on. | The checkbox toggles visibility of every label sprite. | RN-06 |
| RN-07 | The "Inside" preset renders without errors. | No page errors after clicking it; screenshot saved. | RN-07 |

Screenshots from each run land in `test/output/` (`default.png`,
`hidpi.png`, `top.png`, `inside.png`) for visual review.

## 6. What is modelled (current values)

| Element | Where | Size | Notes |
| --- | --- | --- | --- |
| Room | — | 11'-1" × 10'-5" × 8'-0" | ceiling assumed |
| Door | back wall, 0'-9" from left corner | 2'-6" × 6'-8" | hinged left, opens in, shown at 90° |
| Closet | back wall, alcove 6'-4" → 11'-1" | 4'-9" wide × 2'-0" deep | 3'-6" bifold opening at 7'-0", drawn part-open |
| Window 1 | front wall at 3'-6" | 2'-6" × 4'-0" | sill 3'-0" |
| Window 2 | front wall at 6'-4" | 2'-6" × 4'-0" | sill 3'-0"; 4" mullion |
| Linen closet nook | left wall, z 3'-0" → 6'-0" | 2'-3" × 3'-0" × 8'-0" | opens to the hall; solid from the bedroom |
| Concrete pad | outside front wall | 11'-10" × 4'-6" | starts 9" left of the room, flush with the exterior face |
| AC condenser | on pad, x = 1'-0", 1'-0" out | 3'-0" cube | fan ring on top |
| Drain | on pad, x = 5'-0", 2'-4" out | 6" diameter | |
| Bed, nightstand, dresser | inside | see panel | **placeholders** to exercise the clearance rules |

## 7. Assumptions to confirm on site

| ID | Assumption | Why it matters |
| --- | --- | --- |
| A-01 | Ceiling height 8'-0". | Wall panel height, closet header, window head clearance. |
| A-02 | Exterior wall thickness 6". | Where the pad, AC unit and drain start. |
| A-03 | Door leaf 2'-6" × 6'-8", starting 9" from the left corner, hinged left. | Swing clearance zone. |
| A-04 | Closet alcove 4'-9" × 2'-0" with a 3'-6" bifold opening. | Closet depth is not on the crop; 2' is the reach-in standard. |
| A-05 | Two 2'-6" × 4'-0" windows with a 3'-0" sill. | Only widths are readable from the plan. |
| A-06 | Linen nook 2'-3" × 3'-0" starting 3'-0" down the left wall. | Scaled from the plan. |
| A-07 | Pad 11'-10" × 4'-6"; AC condenser a 3' cube 1' from the wall; drain 6" at 5'-0", 2'-4" out. | Scaled from the plan; condenser size and exact spots are guesses. |
| A-08 | The room's left wall is straight. The plan shows a small jog beside the door (about 9" × 3') that is not modelled. | Minor floor-area difference. |
| A-09 | Furniture is placeholder only. | Replace with real pieces once measured. |

## 8. How to run the tests

```sh
npm install                      # three.js (served locally to the tests) + playwright
npx playwright install chromium  # once, for the render suite
npm test                         # spec + render suites
npm run test:spec                # config/geometry rules only, no browser
npm run test:render              # browser suite only
```

The render suite intercepts the CDN requests for Three.js and serves the
copy from `node_modules`, so it runs offline. If Playwright is not installed
the render suite is skipped, not failed.

## 9. Manual checks

Do these in a real browser after any visual change:

1. Open `index.html` on a Retina/HiDPI display. The 3-D view must fill the
   area right of the panel with no cropping or offset (RN-02).
2. Orbit all the way round. Walls facing you disappear together with their
   door, windows and labels; you never see a wall from the outside.
3. Top view: the layout matches the plan orientation (door top-left, closet
   top-right, windows at the bottom, pad below).
4. Inside view: you are standing near the window wall looking at the door
   and closet. Nothing z-fights (flickers) on the wall around the closet.
5. Change width to 9 in the panel. The spec check turns orange and names
   the elements that no longer fit. Set it back to 11.083 and it turns green.
6. Turn labels off; every label disappears, including those on the walls.

## 10. Out of scope (for now)

- Wall thickness inside the room, baseboards, ceiling, lighting fixtures.
- Dragging furniture with the mouse; editing openings from the panel.
- The hallway, stairs, bathroom and the rest of the house.
- Real furniture models (everything is a box).
