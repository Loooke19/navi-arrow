# REDO3 - Ground alignment + single curtain (priority over REDO2/REDO.md where they conflict)

Current state (docs/compare/demo-02-turn-banner.png, redo2-grid.png): curtain now enters from the bottom and is translucent - good, keep that. Two remaining problems:
A. The far part (the right turn) climbs into the sky and ends at building height. Root cause: the 3D camera horizon does not match the background photo horizon, and/or route points are not all on y=0.
B. It reads as a hollow tunnel (two thin side walls + a top line), not ONE curtain.

## 1. Calibrate the camera to the photo (most important)
- Find the photo's vanishing point / horizon line (where the street's lane lines and building bottoms converge). Store it per background as config: { horizonY (0..1 of image height), vanishX (0..1) }.
- Derive camera pitch so the 3D horizon (projection of a point at y=1.6, z=-10000) lands exactly on horizonY, given FOV and object-fit:cover crop of the photo. Do the cover-crop math explicitly so it holds at every viewport aspect ratio.
- Add a gui toggle "地面网格" that draws a 1m ground grid (y=0) out to 80m plus the horizon line. Acceptance: grid lines visually run parallel to the lane lines in the photo and converge at the same vanishing point. Include this debug screenshot in docs/compare.
- Every route control point must have y=0. Add an automated check (unit test or the shot script): project all sampled route points to screen; each must be BELOW the horizon line, and the farthest point must be within ~3% of screen height of the horizon. Fail the test otherwise.

## 2. Route shape
- Straight along the current lane for ~25-35m, then a smooth right turn (radius 6-10m) into the cross street, continue 20-30m, fading out by ~60m. After the turn the route should look small, low and close to the horizon, never above building bases.
- Lateral position: centered on the walkable lane / road in the photo, not drifting onto building facades.

## 3. One curtain, not a tunnel
- Replace the two side walls with ONE vertical ribbon along the route centerline: bottom at y=0, top at 0.5m (gui 0.3-0.8). Double-sided material, so it reads as a single translucent sheet when seen at an angle in the turn.
- Under it, a soft ground glow strip about 0.8-1.2m wide (additive, low alpha, feathered edges) so it reads as "on the ground".
- Top edge: thin bright line (screen-space width via Line2 / LineMaterial, ~2px near, thinner far), not a tube.
- Optional: sliding flat ground chevrons (Baidu style) inside the glow strip, low alpha, moving forward on a 1.5s loop.
- Scanlines horizontal on the sheet, visible; alpha gradient top ~0.45 to bottom ~0.08; distance fade.

## 4. Camera live mode
- Without orientation data, use default pitch -10deg and horizonY 0.45. With DeviceOrientation, use the phone's real pitch/roll so the ground stays on the ground when tilting. Smooth sensor noise (low-pass filter).
- Mobile performance: cap devicePixelRatio at 2, bloom at half resolution, target 60fps on a mid-range phone; add a small fps readout in gui.

## Acceptance (I will review screenshots, so make them clear)
- docs/compare/redo3-grid.png: straight, turn, after-turn, side view, ground-grid debug, camera mode (fake stream) - next to dji f_10/f_31 and the Baidu reference.
- The route-below-horizon test passes and is part of npm test.
- Commit, push to GitHub (Loooke19/navi-arrow), then run: notify-grokbot "<Chinese summary + screenshot paths>"
