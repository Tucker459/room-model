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
- An entry door labelled **OPT DOOR**, swinging into the room from a hallway
  beside the stairs.
- A small closet marked **L** (linen) hanging off the same wall as the entry
  door, just past it, with its own door swinging out to the hall. Its box
  projects into the bedroom; from inside the room it is a solid block.
- A bifold ("W"-shaped) closet.
- Two windows side by side.
- A cross-hatched slab outside the window wall with a round symbol in it.
  The user identifies this as the **AC unit and water drainage** area.

Sizes were scaled off the crop at roughly 27 px per foot. **Which wall each
feature is on comes from the room itself, not from the crop's orientation** —
the user confirmed it, standing in the doorway:

| Standing in the doorway | Wall |
| --- | --- |
| the wall you came through | entry door, then the linen nook |
| on your left | the bifold closet |
| on your right | the two windows; the AC pad is outside this wall |
| facing you | blank |

Anything not readable from the plan is listed under **Assumptions**
(section 7) and must be confirmed on site.

## 3. Units and coordinate system

- All lengths are in **feet** (decimal). `ft(feet, inches)` in
  `room.config.js` converts feet-inches. Display uses feet-inches (`11'-1"`).
- The plan is mapped onto the model like this:

| Plan | Model | Notes |
| --- | --- | --- |
| left → right | **x** from 0 to `room.width` | |
| top → bottom | **z** from 0 to `room.length` | |
| up | **y** from 0 (floor) to `room.height` | |
| the wall you walk through | `back` wall, z = 0 | entry door, linen nook |
| on your left | `left` wall, x = 0 | the bifold closet |
| on your right | `right` wall, x = width | the two windows; pad, AC and drain beyond |
| facing you | `front` wall, z = length | blank; the bed head goes against it |

Walking in through the door you face **+z**, your left hand points at **x = 0**
and your right at **x = width**.

- An opening's `from` is measured along its wall from the plan's **left edge**
  (back/front walls) or **top edge** (left/right walls). `width` continues in
  the same direction.
- A door's `hinge` is `start` (nearer the plan's left/top) or `end`.
- Solids (fixtures, furniture) are axis-aligned boxes: `x`/`z` is the
  back-left corner on the floor, `w` along x, `d` along z, `h` up.
- Furniture has a `kind`: `floor` (default, stands on the floor), `wall`
  (hangs on `wall` at `from` along it and `y` above the floor; `w` runs along
  the wall, `d` out from it) or `rug` (lies flat). `facing` (`x+`, `x-`, `z+`,
  `z-`) says which way a floor piece looks and `shape` how it is drawn; `w`/`d`
  stay world-axis extents whatever the facing. `enabled: false` parks a piece
  in the catalogue without placing it.
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
| R-04 | One entry door, on the back wall near the x = 0 corner, hinged at the low-x side, swinging into the room; its swing is clear. | Exactly one `door`; `wall = back`; `hinge = start`; `swing = in`; leaf 2'-4" to 3'-0" wide, ≥ 6'-6" tall. No fixture or furniture intersects the quarter-disc swept by the leaf. | R-04 (three tests) |
| R-05 | One bifold closet on the **left** wall, 2 ft deep, with 2 ft of clear floor in front of its opening. | Exactly one `closet`; `wall = left`; `door = bifold`; `depth = 2'-0"`; opening lies inside its alcove; the alcove is recessed past the wall line (`inwardDepth ≤ 0`); no solid within the 2 ft zone in front of the opening. | R-05 (two tests) |
| R-06 | Two windows side by side on the **right** (exterior) wall; nothing blocks them. | Exactly two `window`s, both `wall = right`, sill 3'-0", width ≥ 2', height ≥ 3', separated by ≤ 1' of mullion. Within 6" of the wall in front of a window: no fixtures, and furniture no taller than the sill. | R-06 (two tests) |
| R-07 | Every solid is inside the room; the linen nook hangs off the **door's wall**, past the opening and clear of the swing, and runs floor to ceiling. | Rect inside the room outline; `linen.z = 0` (the back wall line), `linen.x ≥ door.from + door.width`, swing test clear, `linen.h = room.height`. Furniture kinds are `floor`, `wall` or `rug`. | R-07 (three tests) |
| R-08 | Solids do not overlap each other. | Pairwise footprint overlap test (touching is allowed). | R-08 |
| R-09 | The exterior pad, AC unit and drain are outside the **window** wall; the AC unit sits entirely on the pad. | `exterior.side` is the windows' wall; all three footprints have `inwardDepth ≤ -wallThickness`; AC rect inside pad rect; drain inside pad. | R-09 |
| R-10 | The AC condenser keeps service clearance from the house. | `ac.out ≥ 1'-0"`. | R-10 |
| R-11 | The drain is on the pad and not under the AC unit. | Drain footprint inside the pad and disjoint from the AC footprint. | R-11 |
| R-12 | Wall-mounted furniture hangs on a real wall, inside it, under the ceiling, and clears the openings, whatever stands beneath it, and other wall pieces. | `wall` is a real wall; `from ≥ 0`, `from + w ≤ wall length`; `y ≥ 0`, `y + h ≤ room.height`. No overlap with an opening whose vertical span it crosses; no footprint overlap with a floor solid whose height reaches it; likewise between wall pieces. | R-12 (three tests) |
| R-13 | A rug lies flat inside the room; anything may stand on it. | Footprint inside the room outline; `h ≤ 0'-3"`. Rugs are excluded from R-04, R-05, R-06 and R-08. | R-13 (two tests) |

Every piece of furniture carries an `enabled` flag and is switched on and off
from the panel, so the list doubles as a catalogue of options. Only switched-on
pieces are built and validated. Two further tests cover the catalogue itself:
each option must keep the layout valid when placed on its own, and a
switched-off piece must be invisible to every rule.

Because only two patches of floor in a room this size take a large piece, the
floor options come in pairs that share a slot — **sofa / vanity** under the
windows and **TV-on-easel / cabinet** on the back wall facing the bed. Turning
on both halves of a pair is a real clash and R-08 reports it.

Because only two patches of floor in a room this size take a large piece, the
floor options come in pairs that share a slot — **sofa / vanity** under the
windows and **TV-on-easel / cabinet** on the back wall facing the bed.

Positions in `room.config.js` are a **starting layout**, not a constraint:
pieces are dragged around in the viewer (section 5, RN-09 … RN-11). A move
snaps to the inch and is clamped to the room, and nothing else is prevented —
putting a piece somewhere it should not be is exactly what the rules above are
for. `G-05` unit-tests the snap, the clamp, the quarter-turn and `nextWall`.

Every piece turns, and the turn happens in the plane the piece lives in:

| | A quarter turn means |
| --- | --- |
| floor piece | `w` and `d` swap, `facing` steps `z+ → x+ → z- → x-`, the footprint centre stays put |
| rug | the same |
| wall piece | `w` and `h` swap — landscape ↔ portrait — about the panel's centre; `d`, the projection out from the wall, is untouched |

`nextWall(room, piece)` sends a wall piece round `back → front → left → right`,
keeping how far along the wall it sits as a fraction so it lands in a
comparable place on a wall of a different length. Both are clamped afterwards.

### 4.1 Layouts

A **layout** is where every piece stands, plus the room it stands in. It is
what the viewer saves, loads, exports and imports (`layoutOf` / `applyLayout`,
tested by `G-06`).

```json
{ "version": 1,
  "room": { "width": 11.0833, "length": 10.4167, "height": 8 },
  "furniture": [
    { "id": "bed",     "enabled": true, "w": 5, "d": 6.6667, "h": 2, "x": 2.5833, "z": 3.75, "facing": "z-" },
    { "id": "shelves", "enabled": true, "w": 3, "d": 0.8333, "h": 2, "wall": "front", "from": 8.0833, "y": 3.3333 }
  ] }
```

| Rule | Why |
| --- | --- |
| A layout stores **positions and sizes only** — never names, colours or shapes. | Those live in `room.config.js`, so a saved layout keeps working when the catalogue is restyled. |
| `applyLayout` **skips** what it cannot trust: unknown ids, values that are not finite numbers, walls and facings that are not real. | Layouts arrive from a file the user picked; a bad one must not corrupt the room. |
| Positions are re-clamped on apply. | A layout saved for a bigger room must not leave pieces outside this one. |
| A `version` mismatch **throws** with a readable message. | Silently half-applying an old format is worse than refusing it. |

Geometry helpers have their own unit tests (G-01 … G-04): wall panel
tiling around openings, wall-frame mapping, feet-inches formatting, and the
rectangle/circle overlap helpers used by the rules above.

## 5. Rendering requirements

| ID | Requirement | Acceptance criteria | Test |
| --- | --- | --- | --- |
| RN-01 | The page loads and builds every modelled element. | No script errors; scene contains 1 door, 2 windows, 1 closet, 1 fixture, one object per switched-on furniture piece, pad, AC, drain, 4 wall groups; each wall piece is parented to its wall group and sits on the wall line; ≥ 10 labels; header shows `11'-1" × 10'-5"`; spec check reads "All spec rules pass." | `render.test.js` RN-01 |
| RN-02 | The canvas fills its container on HiDPI displays. | With `devicePixelRatio = 2` the canvas's CSS box equals the `#view` box within 1 px and the drawing buffer is 2× that. (Regression for the "view isn't centred" bug.) | RN-02 |
| RN-03 | The room is centred and fully visible on load. | The room's centre projects within ±0.1 of the viewport centre in normalised device coordinates; all eight room corners project inside the viewport. | RN-03 |
| RN-04 | Walls between the camera and the room are hidden with their doors/windows/labels; from above all four walls show; the top view is oriented like the plan. | From the default camera (+x, +z side) `front` and `right` are hidden, `back` and `left` shown. After "Top view" all four are visible, the back wall is at the top of the screen and the right wall on the right. | RN-04 |
| RN-05 | Editing a dimension in the panel rebuilds the model and re-runs the spec check. | Setting width to 9 changes the floor geometry, updates the header, and surfaces R-02/R-07 violations. | RN-05 |
| RN-06 | Labels can be switched off and on. | The checkbox toggles visibility of every label sprite. | RN-06 |
| RN-07 | The "Inside" preset renders without errors. | No page errors after clicking it; screenshot saved. | RN-07 |
| RN-08 | Furniture options can be placed and removed from the panel. | Unticking a piece removes it from the scene; ticking its slot-mate places that one and the spec check stays green; ticking both turns the spec check orange with an R-08 clash. | RN-08 |
| RN-09 | Floor pieces can be picked up and dragged. | Pressing on a piece selects it (panel shows its name and position) and does **not** orbit the camera. Dragging drops it where the pointer is, snapped to the inch. "Rotate 90°" swaps `w`/`d` about the footprint centre. "Reset layout" restores the committed positions and the spec check goes green. | RN-09 |
| RN-10 | Wall pieces slide along their own wall and cannot leave it. | Arrow keys move the selection an inch a press; pushing past the end of the wall clamps to `wall length − w`. | RN-10 |
| RN-11 | Every piece turns, and wall pieces can change wall. | "Rotate 90°" is enabled for wall pieces too and swaps their `w`/`h` leaving `d` alone; "Next wall" moves a wall piece to another wall, inside it, and the scene rebuilds. "Next wall" is disabled for floor pieces. | RN-11 |
| RN-12 | A layout can be saved, reloaded, exported and imported. | Save stores a named layout; Reset returns to `room.config.js`; Load brings the saved one back; closing and reopening the page restores the working layout; Export downloads the same JSON; Import applies a file and reports a bad one without moving anything; Delete removes the name. | RN-12 |

Wall-mounted pieces are parented to their wall group, so they are hidden and
shown with the wall they hang on (checked in RN-01).

The render suite serves the folder over `http://127.0.0.1` rather than opening
a `file://` URL, because browsers refuse `localStorage` on `file://` and RN-12
needs it. That is also how the page is really used (`npm run serve`). The page
degrades to "nothing is saved" on `file://` rather than erroring.

Screenshots from each run land in `test/output/` (`default.png`,
`hidpi.png`, `top.png`, `options.png`, `inside.png`) for visual review.

## 6. What is modelled (current values)

| Element | Where | Size | Notes |
| --- | --- | --- | --- |
| Room | — | 11'-1" × 10'-5" × 8'-0" | ceiling assumed |
| Door | back wall, 0'-9" from the x = 0 corner | 2'-6" × 6'-8" | hinged at the low-x side, opens in, shown at 90° |
| Closet | left wall, alcove 5'-8" → 10'-5" | 4'-9" wide × 2'-0" deep | runs to the far end of the wall, away from the door; 3'-6" bifold opening at 6'-4", drawn part-open |
| Window 1 | right wall at 2'-6" | 2'-6" × 4'-0" | sill 3'-0" |
| Window 2 | right wall at 5'-4" | 2'-6" × 4'-0" | sill 3'-0"; 4" mullion |
| Linen closet nook | back wall, x 3'-6" → 5'-9" | 2'-3" deep × 8'-0" | hangs off the door's wall just past the leaf; opens to the hall, solid from the bedroom |
| Concrete pad | outside the right wall | 11'-10" × 4'-6" | starts 9" before the back corner, flush with the exterior face |
| AC condenser | on pad, x = 1'-0", 1'-0" out | 3'-0" cube | fan ring on top |
| Drain | on pad, x = 5'-0", 2'-4" out | 6" diameter | |
| Bed (queen) | head against the front wall, x 2'-7" → 7'-7" | 5'-0" × 6'-8" | clear of the closet's 2 ft approach |
| Nightstand | front-right, x 7'-9" → 9'-5" | 1'-8" × 1'-6" × 2'-0" | beside the bed head, clear of the closet's approach |
| Dresser | right wall, z 0 → 3'-6" | 1'-8" × 3'-6" × 2'-10" | back-right corner, below window 1 (2'-10" < the 3'-0" sill) |
| Sofa (two-seater) | right wall under the windows, z 3'-8" → 8'-2" | 2'-8" × 4'-6" × 2'-8" | option, on by default; 2'-8" < the sill. Shares its slot with the vanity |
| Vanity | same slot as the sofa | 1'-6" × 3'-6" × 2'-6" | option, off by default |
| TV on easel | back wall, x 5'-11" → 9'-5" | 3'-6" × 1'-8" × 5'-0" | option, on by default; faces the bed. Shares its slot with the cabinet |
| Cabinet | same slot as the TV | 3'-6" × 1'-8" × 3'-0" | option, off by default; a low two-door sideboard the size of the dresser, so it fits under a 3'-0" sill |
| Rug | under the bed, x 1'-6" → 9'-6" | 8'-0" × 5'-0" | option, on by default; the bed stands on it |
| Full-length mirror | left wall at 0'-6", 0'-10" up | 1'-6" × 5'-0" | wall option, beside the door, before the rack and the closet |
| Bulletin board | front wall at 0'-5", 3'-6" up | 3'-0" × 2'-0" | wall option, over the nightstand |
| Clothes rack | left wall at 2'-9", 4'-10" up | 2'-6" rail, 1'-0" out | wall option, between the door and the closet; the envelope covers rail and hangers |
| Floating shelves | front wall at 8'-1", 3'-4" up | three 3'-0" × 0'-10" shelves | wall option, in the front-right corner |

Every furniture row above is a **starting position**. Drag anything anywhere.

## 7. Assumptions to confirm on site

| ID | Assumption | Why it matters |
| --- | --- | --- |
| A-01 | Ceiling height 8'-0". | Wall panel height, closet header, window head clearance. |
| A-02 | Exterior wall thickness 6". | Where the pad, AC unit and drain start. |
| A-03 | Door leaf 2'-6" × 6'-8", starting 9" from the left corner, hinged left. | Swing clearance zone. |
| A-04 | Closet alcove 4'-9" × 2'-0" with a 3'-6" bifold opening, run to the far end of its wall. | Closet depth is not on the crop; 2' is the reach-in standard. The user confirmed it reaches the end of the wall away from the door. |
| A-05 | Two 2'-6" × 4'-0" windows with a 3'-0" sill. | Only widths are readable from the plan. |
| A-06 | Linen nook 2'-3" wide × 3'-0" deep, starting 3'-6" along the back wall — the same wall as the entry door, as drawn. | Scaled from the plan; it is what the door swing and the walkway past the bed are measured against. |
| A-11 | The windows sit 2'-6" and 5'-4" along the right wall. | Only the wall they are on was confirmed; the distances along it were scaled from the crop. The closet's position is no longer an assumption — it runs to the end of its wall. |
| A-07 | Pad 11'-10" × 4'-6"; AC condenser a 3' cube 1' from the wall; drain 6" at 5'-0", 2'-4" out. | Scaled from the plan; condenser size and exact spots are guesses. |
| A-08 | The room's left wall is straight. The plan shows a small jog beside the door (about 9" × 3') that is not modelled. | Minor floor-area difference. |
| A-09 | Furniture is placeholder only, and the optional pieces use catalogue-typical sizes, not measured ones. | Replace with real pieces once measured. |
| A-10 | Wall-mounted heights (mirror 0'-10", board 3'-6", rack 4'-10", shelves 3'-4") are conventional, not measured. | Head clearance and what fits under each piece. |

## 8. How to run the tests

```sh
npm install                      # three.js (served locally to the tests) + playwright
npx playwright install chromium  # once, for the render suite
npm test                         # spec + render suites (50 tests)
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
7. In **Furniture**, untick *Sofa* and tick *Vanity*: the sofa goes, the vanity
   takes its place and the spec check stays green. Tick *Sofa* again and it
   turns orange with an R-08 clash. Same for *TV on easel* / *Cabinet*.
8. Orbit until the left wall faces you: the windows, the mirror on that wall
   and their labels hide with it, and reappear when it comes back.
9. Drag the bed across the room: the camera must not orbit, the outline and
   the **Selected** readout follow it, and the spec check flags what it now
   blocks. Press **R** to turn it, arrow keys to nudge it, then **Reset
   layout** to put everything back.
10. Drag a wall piece: it stays on its wall, sliding along it and up and down
    it, and stops at the wall's ends and the ceiling.
11. Select the bulletin board and press **Rotate 90°**: it goes from landscape
    to portrait without leaving the wall. Press **Next wall** (or **W**) and it
    moves round to the next one.
12. Name a layout and press **Save**, then **Reset**, then **Load**: the layout
    comes back. Reload the page — your last arrangement is still there, and
    **Reset** returns to `room.config.js`. **Export** writes a `.json` file that
    **Import** reads back.

## 10. Out of scope (for now)

- Wall thickness inside the room, baseboards, ceiling, lighting fixtures.
- Editing openings from the panel, and rotating anything by a free angle
  (turns are 90° steps; footprints stay axis-aligned).
- Sharing a layout between machines other than by exporting the file.
- The hallway, stairs, bathroom and the rest of the house.
- Real furniture models. Pieces are built from boxes; the shapes are
  schematic, sized to the envelope the rules check.
