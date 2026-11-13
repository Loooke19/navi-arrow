# REDO2 - Curtain calibration round (priority over REDO.md where they conflict)

Keep: the top banner, bottom bar, street photo background, Shadow DOM UI, lil-gui, API. They are approved.
Fix: the 3D light curtain. Current problems (see docs/compare/demo-02-turn-banner.png):
1. It floats in mid-air and starts in the middle of the screen; the lower part looks cut off. It does not start at the viewer's feet.
2. Wrong scale: it looks like a thick blue pipe / wall standing in front of a building, not a route running along the street.
3. Too saturated and too opaque; the street behind is not visible; scanlines are almost invisible.

## Required changes
- Camera: eye height 1.6m, FOV ~60deg, pitch slightly down (about -8 to -12deg) so the road surface fills the lower ~45% of the frame, matching the street photo's horizon line. Add a gui control for horizon/pitch so it can be aligned to the photo.
- Route geometry: the first control point must be ~1.5m in front of the camera at ground y=0, so the curtain enters from the BOTTOM EDGE of the screen, then runs forward along the road (realistic distances: 20-60m straight, then a smooth turn with radius 8-15m). It must sit on the road plane, laterally on the lane, never above the ground. No near-plane clipping (camera.near 0.05).
- Curtain size: height 0.35-0.45m (gui adjustable), thin. Top edge line thin (tube radius ~0.015m) and bright; no thick pipe.
- Material: base color desaturated light blue (~#7FB8FF / rgb 127,184,255), alpha top ~0.45, bottom ~0.05; the street photo must be clearly visible through it. Scanlines: clear horizontal lines, 8-14 lines over the curtain height, contrast clearly visible in screenshots. Bloom strength low (0.4-0.6), threshold so only the top edge and flowing band glow.
- Distance fade: fully faded by ~80m. Perspective must make it get thinner and fainter into the distance.
- Chevrons on the ground (if any): flat, low-alpha, same desaturated blue.

## Calibration and acceptance
- Compare against reference/dji-frames/f_10.jpg and f_31.jpg (and other dji-frames) frame by frame: curtain height relative to road width, transparency, color, scanline visibility.
- Produce docs/compare/redo2-grid.png: our screenshots side by side with f_10, f_31, baidu-banner-ar.png. Also a side view screenshot.
- Done only when: curtain starts at bottom of screen, hugs the road, turns smoothly, street visible through it, scanlines visible, no pipe look.
- Commit, push to GitHub (Loooke19/navi-arrow), then run: notify-grokbot "<Chinese summary of what changed + screenshot paths>"

## ADDENDUM: Camera live-view mode (AR demo)
This is an AR live-view navigation demo. The route does not need to be a real navigable path. Add a second background mode:
- Demo page shows two clear buttons (in the demo chrome, not inside the component): "相机实景" and "街景照片". The current street-photo mode stays as is.
- Camera mode: on click, request camera permission with navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080}}, audio:false}); show the live feed as a full-cover <video> (object-fit: cover, muted, playsinline, autoplay) behind the transparent three.js canvas; the curtain, banner and bottom bar render on top exactly like the photo mode.
- Handle errors: permission denied / no camera / insecure context -> show a short Chinese message and fall back to the photo mode. Stop the media tracks when switching back to photo mode.
- Optional but preferred: on mobile, use DeviceOrientationEvent (with iOS requestPermission on the same button tap) to adjust camera pitch/yaw a little so the route roughly stays on the ground when the phone tilts; include a gui toggle to turn this off and a manual horizon/pitch slider.
- Must work on a phone over LAN: camera requires HTTPS, so add @vitejs/plugin-basic-ssl (or equivalent) and an npm script like `npm run dev:https` that serves with --host; print the LAN https URL in README with steps (accept the self-signed cert, then tap 相机实景).
- Keep the component API framework-agnostic: add an option/attribute like background: 'transparent' so the host page can put any video behind it.
- Acceptance: on desktop with a webcam, clicking 相机实景 shows the live feed with the curtain overlaid; switching back restores the photo. Add a screenshot (fake/test media stream in Playwright via --use-fake-device-for-media-stream is fine) to docs/compare/.

