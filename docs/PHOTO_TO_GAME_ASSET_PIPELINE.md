# NIGHTHAWK — Photo-to-Game Asset Pipeline

Status: proposed art workflow; no gameplay code changed.
Branch: `art/character-visual-foundation`

## 1. Choose the correct photo type

### Character likeness references
Use clear, sharp face and body photographs. Prefer:
- Face: front and 3/4 views, even daylight, no beauty filters.
- Body: full-body front and side views, neutral posture, fitted plain clothing.
- Additional: back view, hairline, facial hair and distinctive accessories.

The current Roms and Cleiseis uploads are screenshots of social posts, so they are useful as visual references but should not be used as final textures. For detailed face modelling, direct original photos at higher resolution are preferable.

### Surface references
Use close, straight-on photographs of one material at a time:
- Red/orange sand, pale sand, gravel and rock.
- Weathered concrete, plaster and asphalt.
- Rusted sheet metal, painted metal and corrugated steel.
- Canvas, nylon, webbing and camouflage fabric.
- Wood, glass, rubber and worn plastic.

Avoid perspective, hard shadows, strong reflections, people, text and logos in texture source images.

## 2. Create PBR materials

For each surface, create a consistent material folder:
- `*_basecolor`: colour/albedo without baked lighting or shadows.
- `*_normal`: surface direction detail.
- `*_roughness`: micro-surface roughness.
- `*_ao`: optional ambient occlusion.
- `*_height`: optional displacement/height.

Make tileable materials only when the source supports seamless repetition. Keep unique decals and damage as separate overlays rather than baking everything into a repeating texture.

## 3. Character image-to-model workflow

A photo can guide a likeness, but it does not directly become a rigged 3D character. Recommended stages:
1. Build front/side/3-4 reference board.
2. Sculpt or model head and body in Blender.
3. Retopologise and UV unwrap.
4. Bake high-detail sculpt information into normal/AO maps.
5. Create modular clothing and tactical gear.
6. Rig and test animation deformations.
7. Export GLB/glTF and test in the existing Three.js scene.

Photogrammetry can help with props or environment objects when multiple overlapping photos are available. It is usually not the best route for a clean, animation-ready human character.

## 4. Proposed repository structure

```
assets/
  characters/
    roms/
      references/          # approved source references, if rights allow
      models/
      textures/
      previews/
    cleiseis/
      references/
      models/
      textures/
      previews/
    shadow/
    douglas/
    cliffhanger/
    navy-blue/
    rampol/
    maetja/
  environment/
    materials/
      sand/
      gravel/
      rock/
      concrete/
      asphalt/
      metal/
      fabric/
    props/
    decals/
  audio/
  ui/
```

Do not commit screenshots containing social-media interface elements as production assets. Keep original source photos private unless explicit permission exists to distribute them in the public repository. Prefer committing derived, approved game assets and a small attribution/licence manifest.

## 5. Browser-game optimisation

- Prefer GLB/glTF for 3D assets.
- Use power-of-two texture dimensions where practical (512, 1024, 2048).
- Start with 1K textures for common props and 2K only for hero assets.
- Use shared materials and texture atlases where appropriate.
- Add LODs for operators and large props.
- Compress textures and geometry after validating visual quality.
- Avoid expensive transparent layers and excessive real-time lights.
- Test on integrated graphics and ordinary laptops, not only a high-end desktop.

## 6. Three.js integration checklist

- Confirm model scale, origin and forward axis.
- Confirm material colour space and texture colour-space settings.
- Verify normal-map orientation.
- Check shadows, roughness and metalness under the game's actual lighting.
- Verify skeleton/animation clips and weapon attachment sockets.
- Test load time, draw calls, GPU memory and frame rate.
- Keep asset loading asynchronous and provide a safe fallback if a model fails to load.

## 7. Rights and provenance

Record source, author, licence, date acquired, modifications and attribution requirements for every third-party asset. For photographs of identifiable people, obtain permission for likeness use and distribution. Do not assume that a publicly viewable Instagram image is licensed for commercial game use.

## First asset batch

Recommended first materials: Namib-style red sand, compacted pale sand, gravel, weathered concrete, rusted corrugated metal, and dark asphalt. These provide immediate value across terrain, buildings and cover.
