# NIGHTHAWK — Browser 3D Art Technology Notes

Research snapshot: 18 November 2026. This is a practical recommendation note for the current Three.js 0.187 + Vite stack, not a mandate to add every tool immediately.

## 1. Keep glTF 2.0 / GLB as the model interchange format

Three.js provides an official `GLTFLoader` addon for glTF 2.0. Its documented extension support includes Draco geometry compression, Meshopt compression and KTX2/Basis Universal textures. The loader exposes optional `setDRACOLoader`, `setKTX2Loader` and `setMeshoptDecoder` hooks.

Official reference: https://threejs.org/docs/pages/GLTFLoader.html

Recommendation:
- Author and rig in Blender.
- Export GLB for game runtime.
- Keep editable .blend files outside the runtime bundle.
- Add a single shared model-loading service only when the first real GLB is ready.
- Do not add decoder code or dependencies until an asset actually uses the corresponding compression extension.

## 2. Prioritise texture memory, not only download size

Khronos explains that KTX2 with Basis Universal can remain GPU-compressed and be transcoded to a device-supported GPU format. This can reduce GPU memory use compared with ordinary PNG/JPEG/WebP textures, which are generally decompressed before GPU use. It is particularly useful in multi-asset scenes with many materials.

Official references:
- https://www.khronos.org/ktx/
- https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md
- https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md

Recommendation:
- Keep PNG/TGA masters for authoring.
- Evaluate KTX2/Basis for shipped environment and character textures after quality review.
- Compare visual quality and loading time on the actual target browser/GPU.
- Do not compress source/master files destructively.

## 3. Use Meshopt/Draco selectively

Geometry compression is supported through optional loader integrations. Khronos' glTF Compressor can compare and compress geometry using Draco, Meshopt and quantisation, and textures using KTX2, JPEG, PNG and WebP.

Reference: https://github.com/KhronosGroup/glTF-Compressor

Recommendation:
- Start with clean, sensible geometry and LODs.
- Use Meshopt or Draco only if download size is a measured problem.
- Avoid shipping decoder assets for formats the project does not use.
- Compare decode cost as well as transfer size; a smaller file is not automatically a faster frame.

## 4. Bake detail instead of simulating everything live

Blender's Cycles baking workflow supports baking base colour, normal, AO and procedural textures to image maps for game-engine export. It requires UVs and a bake target.

Official reference: https://docs.blender.org/manual/en/latest/render/cycles/baking.html

Recommendation:
- Bake small surface detail and local AO into texture maps where appropriate.
- Keep runtime lighting responsible for the overall scene lighting.
- Do not bake directional shadows into Base Color.
- Keep collision meshes simple and independent from render meshes.

## 5. NIGHTHAWK-specific priorities

Current source review found:
- `src/render/fighter.js` builds remote fighters from box meshes and simple Lambert materials.
- `src/render/scene.js` creates a small procedural sand texture and uses Lambert materials for world props.
- `src/render/viewmodel.js` already provides a first-person weapon viewmodel.
- The project uses Three.js 0.187 and has no existing character GLB loading pipeline in the reviewed render files.

Recommended order:
1. Build one repeatable environment PBR material from a real photo.
2. Add one GLB prop and prove the loading/export path.
3. Create one shared humanoid rig and one operator prototype.
4. Replace remote fighter visuals without changing simulation/network state.
5. Implement third-person camera only after the full-body rig and weapon sockets exist.
6. Add KTX2/geometry compression after measuring real asset payloads.

## 6. Performance testing

Measure separately:
- Download bytes and time to first playable frame.
- GPU texture memory and CPU decoded memory.
- Draw calls, visible triangles and material count.
- Frame time on integrated graphics.
- Stutter when loading a new operator or environment sector.
- Online interpolation and hit validation after visual replacement.

Do not chase cinematic detail by default. The target is a recognisable realistic art style that stays smooth in a browser battle royale.

## 7. Practical free toolchain

- Blender: modelling, UVs, rigging, baking and GLB export.
- GIMP or Krita: photo cleanup and texture authoring.
- Material Maker: procedural material generation and tileable texture work.
- Khronos glTF Validator / glTF Compressor: asset validation and compression comparison.
- Three.js GLTFLoader: runtime loading.

Re-check each tool's current license and exact version before integrating it into a build pipeline.
