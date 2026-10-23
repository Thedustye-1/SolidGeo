# Changelog

All notable changes to SolidGeo are documented here. Historical source snapshots live in `versions/` and are immutable.

## [2.0.0] — 2026-10-23

### Added

- In-scene live measurement annotations for selected solids, segments, circles, angles, distances, faces and sections.
- Three-view SVG teaching sheet export (front / top / left) from the File menu.
- Dedicated "演示" inspector tab with auto-rotate speed, moving-point trace, solid-of-revolution, visibility pulse and stop-all controls.
- Measurement label visibility switch in View menu and animation panel.
- Axis-aligned section dialog now honors the "cut" (clipping) option.
- Favicon and new application icon set.

### Changed

- Improved light-theme contrast for accent text, relation badges, coordinate readout and solid glyphs.
- Refined label sprite sizing, layout and depth behavior; labels no longer dominate the model.
- Reduced toast stack size and duration.
- Better section fill opacity and layering.
- Application version bumped to 2.0.0; project files record `appVersion: 2.0.0`.

### Fixed

- Menu dropdowns rendered below viewport canvases.
- Single-vector unit-vector operation incorrectly required two vectors.
- Modal screenshots/interaction were initially obscured by the in animation state (no functional change).
- Stale parameter labels when regenerating smooth solids.

## [1.0.0] — 2026-10-23

### Added

- Windows 11 acrylic frameless window with dark/light theme.
- Four synchronized viewports: perspective, top, front, left.
- Parametric primitives: point, segment, line, plane, circle/arc, vector; cube, cuboid, prism, pyramid, cylinder, cone, sphere, tetrahedron.
- Vertex dragging with live dependent geometry and measurements.
- Undo/redo history, scene tree, visibility, renaming and opacity.
- Construction tools: midpoint, intersection, foot, projection, plane through 3 points, plane through line and point, extrude face, section.
- Auto geometric relations and live metrics.
- Vector lab with add/subtract, scalar, dot, cross, magnitude, angle, unit, projection, direction cosines and vector-method steps.
- Hidden/visible edge classification per viewport with dashed hidden edges.
- Section and clipping, per-section SVG/OBJ export.
- PNG 2×, SVG, OBJ and `.geojson` project I/O.
- Auto-rotate, trace, revolve and visibility animations.
- Keyboard shortcuts: R / W / F / Ctrl+S / Delete and more.
