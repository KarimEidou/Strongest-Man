# Third-party assets

Every model in the table below is by **[Kenney](https://kenney.nl)** and released
under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public
domain, free for any use, credit appreciated but not required. One asset in this
repo is not: see the section after the table.

Imported by `tools/import-models.mjs`, which downloads the original pack from
kenney.nl, merges it to a single mesh, rescales it to metric game size, grounds
its origin and re-encodes the palette atlas as WebP. Re-run it to reproduce every
file in the table.

| Game asset | Kenney pack | Source model |
|---|---|---|
| `assets/models/prop_streetlamp.glb` | city-kit-roads | `light-curved.glb` |
| `assets/models/prop_trafficlight.glb` | city-kit-roads | `traffic-light.glb` |
| `assets/models/prop_sign.glb` | city-kit-roads | `road-sign-street.glb` |
| `assets/models/prop_tree.glb` | city-kit-suburban | `tree-large.glb` |
| `assets/models/prop_kiosk.glb` | city-kit-commercial | `detail-parasol-a.glb` |
| `assets/models/car_sedan.glb` | car-kit | `sedan.glb` |
| `assets/models/car_taxi.glb` | car-kit | `taxi.glb` |
| `assets/models/car_van.glb` | car-kit | `van.glb` |
| `assets/models/car_police.glb` | car-kit | `police.glb` |
| `assets/models/car_wreck.glb` | car-kit | `sedan-sports.glb` |
| `assets/models/bld_low_a.glb` | city-kit-commercial | `building-e.glb` |
| `assets/models/bld_low_b.glb` | city-kit-commercial | `building-c.glb` |
| `assets/models/bld_mid_a.glb` | city-kit-commercial | `building-a.glb` |
| `assets/models/bld_mid_b.glb` | city-kit-commercial | `building-j.glb` |
| `assets/models/bld_mid_c.glb` | city-kit-commercial | `building-i.glb` |
| `assets/models/bld_tall_a.glb` | city-kit-commercial | `building-l.glb` |
| `assets/models/bld_tall_b.glb` | city-kit-commercial | `building-n.glb` |
| `assets/models/bld_tower.glb` | city-kit-commercial | `building-skyscraper-a.glb` |

## Not from Kenney, and not CC0

`assets/models/landmark_samosa.glb` is a single mesh lifted from
**["Samosa, Cake Snacks Plate"](https://sketchfab.com/3d-models/samosa-cake-snacks-plate-57baf38756304e7b979372500dac0e91)**
by **ronchoqa**, licensed
**[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)** — which, unlike
everything above, *requires* that attribution. The mesh was extracted from the
multi-object original, stood upright and re-optimized by
`tools/optimize-glb.mjs`; nothing else from the source model ships. It is not
produced by this tool and re-running this tool does not touch it.

## Original work

The characters, monsters, animation clips, hydrant, bench, dumpster, skybox,
splash and title art are original to this project (Higgsfield SAM 3 + Meshy) and
are not covered by any of the above.
