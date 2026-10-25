# KR90 dresspack preview

Public browser-only replay of a computed CAD/manual-informed engineering candidate.

- 历史软U参数均匀全链假设，非实物标定。The historical soft-U effective stiffness (EI = 0.08 N·m²; GJ = 0.05 N·m²) is applied uniformly across the modeled chain; this replay is not the original stiff-tail model or a calibrated real-hardware response.
- Not a live solver, calibrated hardware model, installation acceptance, or manufacturer endorsement.
- The initial CAD shape is a stress-free reference, not a verified gravity equilibrium. H, material properties, internal bundle and bearing resistance remain uncalibrated.
- All 127 saved states are replayed without time interpolation. The original endpoints, material orientations, joint gaps and bend warnings are retained.
- Optional ring-to-ring surface triangles are display only; they do not change the numerical states or collision geometry.
- The 150 mm bend comparison is conditional on the applicable manufacturer article, not a certified pass/fail limit.

This repository contains only the browser viewer and necessary mesh/replay data. Solver sources, manufacturer PDFs, raw simulation logs, credentials, private reviews and backups are excluded. Diagnostic logs not consumed by the viewer are omitted; hashes verify this public export.

Controls: drag to rotate; mouse wheel or two fingers to zoom; middle drag or two fingers to pan; timeline to inspect saved frames.

## Rights and attribution

This preview uses project-supplied KR90 geometry and computed replay data. KUKA and other product names identify the modeled equipment only. No manufacturer affiliation or endorsement is implied. No new open-source or CAD redistribution license is granted by this preview; existing rights and any applicable third-party terms remain with their respective owners.
