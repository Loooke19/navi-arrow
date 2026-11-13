# REDO5 - Review of redo4-grid.png (priority over earlier REDO files)

Good, keep: horizon now sits at the building bases, grid matches the lane lines, route reaches far and the turn is small near the horizon. Calibration is DONE - do not touch that math again (tests must stay green).

## Problem 1: the visual reads as "a thin white line with a dirty dark-blue smudge"
- The ground glow currently DARKENS the photo (navy blur). A glow must only ADD light. Use AdditiveBlending (or premultiplied add), light cyan color (#8EC5FF to #BFE3FF), never a dark color; check the bloom/alpha-preserve pass is not compositing a dark halo. Verify: sample pixels under the glow in the screenshot - they must be brighter than the same pixels in the plain photo.

## Problem 2: a vertical sheet on the line of sight is invisible (design decision)
In first-person walking view the route goes straight away from the camera, so a vertical sheet along it is seen edge-on and collapses to a line. DJI frames are seen from above/side, which is why theirs reads as a curtain. Change the hero to:
- A ground BAND 1.2m wide (gui 0.6-2.0) lying on y=0 along the route: translucent light-blue fill (alpha ~0.25 near, fading far), two crisp bright edge lines (screen-space ~2px near), fine horizontal scanlines across the band, flowing light pulse moving forward (2.5s loop).
- Low translucent curtains standing on BOTH edges of the band, height 0.25m (gui 0-0.6), alpha gradient top 0.5 -> bottom 0.05. Straight ahead they read as two glowing rails; in the turn they open up and read as a curtain wall - that is the 3D feel we want.
- Flat sliding chevrons inside the band (Baidu style, ~0.6m, low alpha, spaced 3m, moving forward and fading).
- Near fade over the first 1-2m so the bottom edge is soft, not a hard dark block.

## Problem 3: performance
- Report says 11fps. Investigate (bloom passes, full-res render targets, geometry rebuilt every frame?). Target >=55fps at 390x844 DPR2 on desktop Chrome; print the measured fps in the summary. Don't rebuild geometry per frame; update uniforms only.

## Acceptance
- docs/compare/redo5-grid.png same 6 panels + references. In the straight view the band must be clearly visible as a lit lane on the road; in the turn view the edge curtains must visibly stand up.
- Pixel check for "glow brightens" added to the shot script or tests.
- npm test green, commit, push, then notify-grokbot "<Chinese summary + fps + screenshot paths>".
