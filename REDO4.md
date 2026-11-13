# REDO4 - Correction after reviewing redo3-grid.png (priority over earlier REDO files)

Progress: single sheet + thin top line + nothing climbing into the sky - good, keep.
But it is now over-corrected: the whole route is squashed into the bottom ~15% of the screen and turns right almost immediately (looks like 3-5m ahead). It should run far up the street.

## Evidence the calibration is still wrong
- In demo-05 (ground grid debug) the grid stops and a bright green horizontal line sits at about 86% of screen height. The photo's real horizon / vanishing point (where the street and building bases converge, below the tall tower) is at about 62-65% of screen height. So the 3D horizon is ~20% of screen too low.
- The horizon test passed anyway, which means it compares against the code's own (wrong) horizon. Fix the test so it projects a far point (0, 0, -10000) to SCREEN pixels in the real viewport (after object-fit: cover crop) and asserts it is within 1.5% of the configured photo horizon (horizonY of the IMAGE, converted to screen through the same cover math). Test at 3 viewports: 390x844, 430x932, 1280x800.
- Check: camera pitch sign, horizonY in image space vs screen space, cover-crop offset, and that the camera aspect/FOV used for the math equals the real renderer size.

## Route
- Straight ahead along the lane for 30m (it must visibly reach up to near the base of the far buildings), then turn right with radius ~8m, then 20m more. Fade by ~60m.
- Expected result: near part enters at the bottom edge, the line shrinks toward the vanishing point, the turn happens small and close to the horizon at the right side of the street.

## Look
- The near sheet currently reads as a thick dark-blue blob at the bottom. Make the near part lighter: lower alpha near the camera (fade in over the first 2-3m), ground glow width 0.8m with soft edges, color closer to #8EC5FF, less dark/saturated core.
- Scanlines: slightly irregular spacing/brightness and slow upward drift, not perfectly uniform.

## Acceptance
- docs/compare/redo4-grid.png incl. ground-grid debug where the grid reaches the photo horizon and the horizon line sits on the vanishing point.
- npm test passes with the fixed horizon test.
- Commit, push, then notify-grokbot "<Chinese summary + screenshot paths>"
