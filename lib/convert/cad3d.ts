/**
 * CAD & 3D flagship conversions — the niche xonvert competes in.
 *
 * Every pair here is one the in-browser engines really perform (lib/convert/
 * matrix.ts: dwg→dxf via libredwg, step/iges/brep→stl/obj via OCCT, mesh
 * formats→glb/gltf via assimp), verified with real sample files on arad.
 * Copy is hand-written per format and per pair — never add pairs by template.
 */
import type { ConvertPair } from '@/lib/convert/pairs';
import type { ConversionContentData, FaqItem } from '@/lib/convert/content';

interface FormatInfo {
  name: string;
  what: string;
  usedBy: string;
}

export const CAD3D_FORMATS: Record<string, FormatInfo> = {
  dwg: {
    name: 'DWG (AutoCAD Drawing)',
    what: 'DWG is AutoCAD’s native binary drawing format. It stores 2D drafting and 3D geometry together with layers, blocks, dimensions and text. The format is proprietary and changes with AutoCAD releases, which is why many programs cannot open it.',
    usedBy: 'Architects, civil and mechanical engineers, and anyone receiving drawings exported from AutoCAD, BricsCAD or DraftSight.',
  },
  dxf: {
    name: 'DXF (Drawing Exchange Format)',
    what: 'DXF is Autodesk’s documented exchange format for drawings, published since 1982. Its ASCII variant is plain text, so almost every CAD, CAM and vector program can read it.',
    usedBy: 'LibreCAD, QCAD, FreeCAD, Inkscape, and the software behind laser cutters, plasma tables and CNC routers.',
  },
  step: {
    name: 'STEP (ISO 10303)',
    what: 'STEP is the ISO standard for exchanging exact 3D solid models. It describes geometry as precise mathematical surfaces (B-rep and NURBS), not triangles, so a cylinder is stored as a true cylinder.',
    usedBy: 'Mechanical design tools such as SolidWorks, Fusion 360, Inventor, CATIA, Creo, Onshape and FreeCAD — it is the default “send me the model” format between them.',
  },
  stp: {
    name: 'STP (STEP file)',
    what: 'STP is the same ISO 10303 STEP format under a shorter extension. The contents are identical to a .step file: exact solid geometry described by mathematical surfaces.',
    usedBy: 'Supplier part libraries (McMaster-Carr, TraceParts), SolidWorks, Fusion 360, CATIA and FreeCAD.',
  },
  iges: {
    name: 'IGES (Initial Graphics Exchange Specification)',
    what: 'IGES is the older US exchange standard for CAD surfaces and wireframes, first published in 1980; its last revision (5.3) dates from 1996. Many IGES files contain loose surfaces rather than closed solids.',
    usedBy: 'Legacy CAD archives, older CAM systems, and suppliers who still export surfaces for tooling and moulds.',
  },
  igs: {
    name: 'IGS (IGES file)',
    what: 'IGS is the short extension for IGES files. The format is the same: CAD surfaces, curves and sometimes solids in the 1980s US exchange standard.',
    usedBy: 'Older CAD/CAM pipelines and supplier archives.',
  },
  brep: {
    name: 'BREP (Open CASCADE boundary representation)',
    what: 'BREP is the native file format of the Open CASCADE geometry kernel. It stores exact boundary-representation solids, and FreeCAD uses it internally for its shapes.',
    usedBy: 'FreeCAD, CadQuery and other tools built on Open CASCADE.',
  },
  stl: {
    name: 'STL (stereolithography)',
    what: 'STL, introduced in 1987 for 3D Systems’ stereolithography machines, describes a surface only as a list of triangles. It carries no colour, no materials and no units.',
    usedBy: 'Every 3D-printing slicer — Cura, PrusaSlicer, Bambu Studio, Chitubox — and model sites like Printables and Thingiverse.',
  },
  obj: {
    name: 'OBJ (Wavefront)',
    what: 'OBJ is a simple text mesh format from Wavefront Technologies. It stores vertices, faces, normals and texture coordinates; materials live in a separate .mtl file next to it.',
    usedBy: 'Blender, Maya, 3ds Max, ZBrush, and photogrammetry and 3D-scanning tools.',
  },
  fbx: {
    name: 'FBX (Autodesk Filmbox)',
    what: 'FBX is Autodesk’s proprietary interchange format for meshes, materials, skeletons and animation. It is the de-facto format for moving animated assets between content tools and game engines.',
    usedBy: 'Maya, 3ds Max, MotionBuilder, Unity, Unreal Engine, and asset stores such as Mixamo.',
  },
  dae: {
    name: 'DAE (COLLADA)',
    what: 'DAE is COLLADA, an XML interchange format maintained by the Khronos Group. It can hold scenes with meshes, materials, cameras, lights and animation.',
    usedBy: 'SketchUp exports, older game pipelines, and tools that predate glTF.',
  },
  ply: {
    name: 'PLY (Stanford Polygon)',
    what: 'PLY, created at Stanford for 3D scanning research, stores meshes or point clouds and is good at keeping per-vertex colour.',
    usedBy: '3D scanners, photogrammetry software (Meshroom, RealityCapture), MeshLab and CloudCompare.',
  },
  '3ds': {
    name: '3DS (3D Studio)',
    what: '3DS is the binary format of the original DOS 3D Studio. It is limited — 65,536 vertices per mesh and 8.3 texture filenames — but huge numbers of older models still exist only as .3ds.',
    usedBy: 'Legacy model archives and old 3ds Max projects.',
  },
  '3mf': {
    name: '3MF (3D Manufacturing Format)',
    what: '3MF is a ZIP container of XML created by the 3MF Consortium (Microsoft, HP, Autodesk and others) as a modern replacement for STL. Unlike STL it records units, colours, materials and multiple objects.',
    usedBy: 'PrusaSlicer, Bambu Studio, Cura and Windows 3D Builder.',
  },
  gltf: {
    name: 'glTF (GL Transmission Format)',
    what: 'glTF is the Khronos Group’s open standard for delivering 3D models, often called “the JPEG of 3D”. A .gltf file is JSON that describes meshes and physically based (PBR) materials, with binary data and textures alongside or embedded.',
    usedBy: 'three.js, Babylon.js, Blender, Sketchfab, and developers who want a readable, editable model file.',
  },
  glb: {
    name: 'GLB (binary glTF)',
    what: 'GLB is glTF packed into one binary file: scene description, geometry and textures together. That single self-contained file is why the web and AR use it.',
    usedBy: '<model-viewer>, three.js, Android Scene Viewer, Shopify 3D product models, Blender and game engines.',
  },
};

interface PairSpec {
  from: string;
  to: string;
  toolId: string;
  /** Why people do this conversion. */
  why: string;
  /** What survives and what does not — the honest part rivals skip. */
  quality: string;
  /** Concrete situations. */
  uses: string;
  faq: FaqItem[];
}

const TESSELLATE = 'STEP and IGES describe exact curved surfaces; STL and OBJ can only hold triangles. The converter tessellates every surface into a triangle mesh, so a perfect cylinder becomes many flat facets. The feature history, parametric dimensions and assembly metadata do not survive — only the shape does.';

const PAIRS: PairSpec[] = [
  {
    from: 'dwg', to: 'dxf', toolId: 'convert-anything',
    why: 'Someone sent you an AutoCAD .dwg and your software (LibreCAD, QCAD, Inkscape, a laser-cutter or CNC program) only reads DXF. Converting to DXF is the standard way to open an AutoCAD drawing without AutoCAD.',
    quality: 'The drawing is read with LibreDWG, the GNU project’s open DWG library, and written back out as DXF. Lines, arcs, polylines, circles, layers, blocks and text come across. Custom objects from AutoCAD add-ons (vertical products such as Civil 3D) and some of the newest DWG features may not be understood and can be missing. Open the result and check the parts that matter before sending it to a machine.',
    uses: 'Opening an architect’s floor plan in LibreCAD; preparing a part outline for a laser cutter; importing a site plan into Inkscape or QGIS; archiving drawings in an open format.',
    faq: [
      { question: 'Do I need AutoCAD to convert DWG to DXF?', answer: 'No. The conversion runs in your browser with LibreDWG compiled to WebAssembly. Nothing is installed and the drawing is not uploaded.' },
      { question: 'Will layers and blocks be kept?', answer: 'Yes for standard entities — layers, blocks, lines, arcs, polylines and text are read and written to DXF. Custom objects from AutoCAD vertical products may be dropped.' },
      { question: 'My DWG is confidential. Is it safe?', answer: 'The file never leaves your computer. The conversion code runs locally in the browser tab, so no server ever receives the drawing.' },
      { question: 'Why does my laser cutter want DXF instead of DWG?', answer: 'DXF is a documented, largely text-based format that CAM software can parse reliably. DWG is proprietary and changes with AutoCAD versions.' },
    ],
  },
  {
    from: 'step', to: 'stl', toolId: 'cad-convert',
    why: 'Slicers print triangle meshes, not CAD solids. If you downloaded a part as STEP or designed it in Fusion 360 or SolidWorks, converting STEP to STL is the step between the CAD model and your 3D printer.',
    quality: `${TESSELLATE} STL has no units: slicers assume millimetres, which matches almost all mechanical CAD, but check the size after import. Closed STEP solids produce watertight meshes that print cleanly.`,
    uses: 'Printing a bracket downloaded from a supplier; sending a Fusion 360 part to a print farm; checking a customer’s STEP file fits your printer bed.',
    faq: [
      { question: 'Why does my printed part look faceted?', answer: 'STL stores triangles, so curved faces are approximated. Tessellation turns each curved face into many small flat facets.' },
      { question: 'Will the model be the right size?', answer: 'The geometry keeps its coordinates. STL has no unit field, so slicers read the numbers as millimetres — correct for nearly all mechanical STEP files.' },
      { question: 'Can I convert an assembly?', answer: 'Yes, when the assembly is in one file: all its solids are meshed into one STL. Assemblies whose top file only references parts stored in separate files cannot be read — export a single-file STEP from your CAD tool.' },
      { question: 'Is my design uploaded?', answer: 'No. OpenCASCADE runs inside your browser as WebAssembly; the STEP file never leaves your device.' },
    ],
  },
  {
    from: 'step', to: 'obj', toolId: 'cad-convert',
    why: 'Render and animation tools such as Blender cannot open STEP. Converting STEP to OBJ turns an engineering model into a mesh you can light, texture and render for product shots or presentations.',
    quality: `${TESSELLATE} OBJ keeps the geometry as a clean mesh with normals, ready for smoothing and materials in Blender; CAD colours are not transferred.`,
    uses: 'Product visualisation in Blender or KeyShot; putting a machine part into an architectural scene; making a quick web preview of a CAD model.',
    faq: [
      { question: 'Can Blender open STEP files?', answer: 'Not out of the box. Converting to OBJ (or STL) gives Blender a mesh it imports directly.' },
      { question: 'Why STEP to OBJ instead of STL?', answer: 'OBJ is the more common import for render tools and keeps vertex normals; STL is the choice for 3D printing.' },
      { question: 'Will I keep the CAD feature tree?', answer: 'No. Meshes only store shape. Keep the STEP file as your editable master.' },
      { question: 'Is there a file size limit?', answer: 'The work happens on your device, so the practical limit is your browser’s memory. Typical parts and small assemblies convert in seconds.' },
    ],
  },
  {
    from: 'stp', to: 'stl', toolId: 'cad-convert',
    why: 'Part libraries such as McMaster-Carr and TraceParts hand out .stp files. To 3D-print one you need an STL your slicer can read.',
    quality: `An .stp file is a STEP file, so the conversion is the same. ${TESSELLATE}`,
    uses: 'Printing a downloaded bracket, knob or enclosure; test-fitting a vendor part; sending a supplier model to a print service.',
    faq: [
      { question: 'Is STP different from STEP?', answer: 'No — .stp and .step are two extensions for the same ISO 10303 format.' },
      { question: 'Will it be watertight for printing?', answer: 'Closed solids in the STP produce closed meshes. Surface-only models can leave gaps that slicers flag.' },
      { question: 'What units does the STL use?', answer: 'STL has no units; slicers assume millimetres, matching most STP part libraries.' },
      { question: 'Do I need to sign up?', answer: 'No account is needed, and the file is converted locally without uploading.' },
    ],
  },
  {
    from: 'stp', to: 'obj', toolId: 'cad-convert',
    why: 'A vendor sent an .stp model and you need it in a render, game or web scene. OBJ is the mesh format those tools import most reliably.',
    quality: `${TESSELLATE} OBJ keeps normals for smooth shading in render tools.`,
    uses: 'Showing a purchased component in a product render; building a digital twin scene; converting catalogue parts for Blender.',
    faq: [
      { question: 'Can I open the OBJ in Blender?', answer: 'Yes. File → Import → Wavefront (.obj).' },
      { question: 'Are colours kept?', answer: 'No. CAD colours are not transferred; assign materials in your render tool.' },
      { question: 'Is .stp the same as .step?', answer: 'Yes, identical format with a shorter extension.' },
      { question: 'Does it work offline?', answer: 'After the page and engine have loaded once, the conversion runs locally in your browser.' },
    ],
  },
  {
    from: 'iges', to: 'stl', toolId: 'cad-convert',
    why: 'Old CAD archives and some suppliers only provide IGES. Converting IGES to STL is the way to print or inspect those models with modern mesh tools.',
    quality: `${TESSELLATE} IGES files often contain individual surfaces rather than a closed solid, so the resulting mesh can have gaps. Run it through your slicer’s repair or Meshmixer before printing.`,
    uses: 'Reviving a legacy part for 3D printing; inspecting a mould surface; bringing old supplier data into a mesh workflow.',
    faq: [
      { question: 'Why does my slicer say the mesh has holes?', answer: 'Many IGES files are open surface sets, not closed solids. Those gaps carry into the STL; repair them in the slicer or a mesh editor.' },
      { question: 'Should I ask for STEP instead?', answer: 'If you can — STEP usually carries closed solids and converts more cleanly. IGES works when it is all you have.' },
      { question: 'Is my file uploaded?', answer: 'No. The conversion runs on your device.' },
      { question: 'What about .igs files?', answer: '.igs is the same format — use the IGS to STL converter or rename the file.' },
    ],
  },
  {
    from: 'iges', to: 'obj', toolId: 'cad-convert',
    why: 'Bring legacy IGES surfaces into Blender, a game engine or a visualisation tool, which all read OBJ.',
    quality: `${TESSELLATE} Open IGES surface sets stay open in the mesh, which is fine for rendering.`,
    uses: 'Rendering an old product design; using archived car-body surfaces in a visual scene; quick inspection of IGES data.',
    faq: [
      { question: 'Can render tools open IGES?', answer: 'Rarely. OBJ is the widely supported way in.' },
      { question: 'Will surfaces be smooth?', answer: 'Surfaces are tessellated into triangles with normals, which shade smoothly in render tools.' },
      { question: 'Are IGES layers kept?', answer: 'No — the result is one mesh.' },
      { question: 'Is there any cost?', answer: 'The conversion is free and runs locally.' },
    ],
  },
  {
    from: 'igs', to: 'stl', toolId: 'cad-convert',
    why: '.igs files from older CAD systems need to become STL before a slicer or mesh tool can use them.',
    quality: `${TESSELLATE} Like any IGES data, an .igs made of loose surfaces can give a mesh with gaps that needs repair before printing.`,
    uses: 'Printing legacy parts; importing old tooling data into mesh software.',
    faq: [
      { question: 'Is IGS the same as IGES?', answer: 'Yes — .igs is the short extension for IGES.' },
      { question: 'Will it print?', answer: 'Closed solids print directly. Open surfaces need a repair pass in your slicer.' },
      { question: 'Is my model private?', answer: 'Yes. It is processed in your browser and never uploaded.' },
      { question: 'Can I get OBJ instead?', answer: 'Yes, the IGES to OBJ converter produces a mesh for render tools.' },
    ],
  },
  {
    from: 'brep', to: 'stl', toolId: 'cad-convert',
    why: 'FreeCAD and CadQuery users working with Open CASCADE .brep shapes need STL to print them or share them with people who do not use OCCT tools.',
    quality: `BREP holds exact solids, like STEP. ${TESSELLATE}`,
    uses: 'Printing a CadQuery-generated part; sharing FreeCAD geometry with a print service; checking generated shapes in a mesh viewer.',
    faq: [
      { question: 'What creates .brep files?', answer: 'Open CASCADE-based tools — FreeCAD, CadQuery and similar — use BREP as their native shape format.' },
      { question: 'Is the conversion accurate?', answer: 'It uses the same Open CASCADE kernel that wrote the file, compiled to run in your browser.' },
      { question: 'Can I control mesh resolution?', answer: 'The converter uses a balanced default tessellation. For very fine control, export from FreeCAD’s Mesh workbench.' },
      { question: 'Is it uploaded anywhere?', answer: 'No, it runs locally.' },
    ],
  },
  {
    from: 'obj', to: 'glb', toolId: 'model-3d-convert',
    why: 'Websites, AR viewers and online stores want one GLB file, not an OBJ with a separate .mtl and textures. Converting OBJ to GLB packs the model into a single file for the web.',
    quality: 'Geometry, normals and texture coordinates carry over. Materials come from the .mtl file; a lone .obj has no material information, so the model gets a default material that you can restyle later.',
    uses: 'Putting a scanned object on a product page with <model-viewer>; sharing a model by email as one file; loading assets into three.js.',
    faq: [
      { question: 'Why is my GLB grey?', answer: 'An OBJ on its own has no materials — they live in the .mtl file and texture images. Without them the model uses a default material.' },
      { question: 'Will the GLB work on my website?', answer: 'Yes. GLB is what <model-viewer>, three.js and Shopify 3D expect.' },
      { question: 'Is the model uploaded?', answer: 'No. The Assimp library runs in your browser; the file stays on your device.' },
      { question: 'Can I go back to OBJ?', answer: 'Blender imports GLB and exports OBJ if you need it.' },
    ],
  },
  {
    from: 'stl', to: 'glb', toolId: 'model-3d-convert',
    why: 'Show a 3D print design on the web or in AR. STL cannot be displayed by most web viewers; GLB can.',
    quality: 'STL has only triangles — no colour, no UVs — so the GLB has the exact geometry with a default material. The file often gets smaller, because GLB stores shared vertices once.',
    uses: 'Previewing prints on a shop page; showing designs on a portfolio; AR previews of printed products on Android.',
    faq: [
      { question: 'Will the GLB have colour?', answer: 'STL carries no colour, so the model gets a neutral default material you can change in any 3D editor.' },
      { question: 'Is the geometry changed?', answer: 'No. The triangles are copied as-is.' },
      { question: 'Can people view it on their phone?', answer: 'Yes. GLB opens in Android Scene Viewer and in any page using <model-viewer>.' },
      { question: 'Do I need an account?', answer: 'No, and the file is never uploaded.' },
    ],
  },
  {
    from: 'fbx', to: 'glb', toolId: 'model-3d-convert',
    why: 'FBX is the game-industry format, but the web and AR speak glTF. Converting FBX to GLB takes Mixamo characters and Unity or Unreal assets onto web pages.',
    quality: 'Meshes, materials and the node hierarchy are converted by Assimp. Skeletons and animations are carried over where Assimp can map them to glTF, but complex rigs, blend shapes and proprietary material settings should be checked in a viewer before publishing.',
    uses: 'Putting a Mixamo character on a website; moving game assets into three.js or Babylon.js; making AR previews from FBX product models.',
    faq: [
      { question: 'Are animations kept?', answer: 'Where Assimp can map them to glTF, yes. Always preview the GLB — complex rigs and blend shapes can need fixes in Blender.' },
      { question: 'Why do textures look different?', answer: 'glTF uses physically based materials. FBX shading models are approximated during conversion.' },
      { question: 'Is my asset uploaded?', answer: 'No. Conversion runs locally in the browser.' },
      { question: 'Is FBX to GLB lossless?', answer: 'Geometry is. Materials and animation depend on how the FBX was authored.' },
    ],
  },
  {
    from: 'dae', to: 'glb', toolId: 'model-3d-convert',
    why: 'COLLADA files from SketchUp and older pipelines are large XML files that few modern viewers support. GLB is compact and opens everywhere.',
    quality: 'Geometry, the node hierarchy and basic materials convert. A GLB is typically much smaller than the equivalent XML DAE. Textures referenced by external paths need to be available; otherwise the model keeps its colours without images.',
    uses: 'Publishing a SketchUp model to the web; modernising an old COLLADA asset library; loading legacy scenes in three.js.',
    faq: [
      { question: 'Why convert DAE to GLB?', answer: 'GLB is binary, much smaller, and supported by modern web and AR viewers; COLLADA support is fading.' },
      { question: 'Will my SketchUp colours stay?', answer: 'Basic material colours convert. Check textures, which DAE references as separate image files.' },
      { question: 'Is the file uploaded?', answer: 'No — it is converted on your device.' },
      { question: 'Does it keep the scene hierarchy?', answer: 'Yes, nodes and transforms are preserved.' },
    ],
  },
  {
    from: 'ply', to: 'glb', toolId: 'model-3d-convert',
    why: '3D scans and photogrammetry often come out as PLY. GLB lets you show the scan on a web page or in AR.',
    quality: 'Mesh geometry converts directly. PLY’s per-vertex colours — how most scans store their appearance — are written as glTF vertex colours. A point cloud with no faces has no surface to display.',
    uses: 'Sharing a photogrammetry scan online; showing a scanned artefact in a museum web page; AR previews of scanned objects.',
    faq: [
      { question: 'Will my scan colours be kept?', answer: 'Per-vertex colours are carried into the GLB.' },
      { question: 'Can I convert a point cloud?', answer: 'A PLY with only points and no faces has no surface; mesh it first in MeshLab or CloudCompare.' },
      { question: 'Is the scan uploaded?', answer: 'No. Everything runs in your browser.' },
      { question: 'Why is the GLB large?', answer: 'Scans have millions of triangles. Decimate the mesh in MeshLab first for faster web loading.' },
    ],
  },
  {
    from: '3ds', to: 'glb', toolId: 'model-3d-convert',
    why: 'Old .3ds models from the 1990s and 2000s are unreadable by most modern viewers. GLB gives them a second life on the web.',
    quality: 'Meshes, the object hierarchy and material colours convert. 3DS texture filenames are limited to 8.3 characters and point to external images; if those are missing, the model keeps its colours without textures.',
    uses: 'Rescuing a legacy model library; displaying retro assets on a website; bringing old 3D Studio work into Blender.',
    faq: [
      { question: 'Can modern tools open 3DS?', answer: 'Some can, many cannot. GLB is supported almost everywhere.' },
      { question: 'Why are textures missing?', answer: '3DS files reference separate image files. Without them only material colours remain.' },
      { question: 'Is it safe for private models?', answer: 'Yes — the conversion happens on your device only.' },
      { question: 'Is there a vertex limit?', answer: '3DS itself caps meshes at 65,536 vertices; GLB has no such limit.' },
    ],
  },
  {
    from: '3mf', to: 'glb', toolId: 'model-3d-convert',
    why: '3MF is the modern 3D-printing format. Converting it to GLB lets you show a print project in a browser or AR viewer.',
    quality: 'The meshes of all objects convert, together with basic colours. Print-specific data — slicer settings, supports and plate layout stored in the 3MF — has no meaning in glTF and is not carried over.',
    uses: 'Showing a Bambu Studio or PrusaSlicer project on a web page; sharing print designs as an interactive preview.',
    faq: [
      { question: 'Are my slicer settings kept?', answer: 'No. GLB is a display format; print settings stay in the 3MF.' },
      { question: 'Will multiple objects convert?', answer: 'Yes, each object becomes part of the GLB scene.' },
      { question: 'Is the file uploaded?', answer: 'No. It is processed locally.' },
      { question: 'Can I print the GLB?', answer: 'Keep the 3MF or an STL for printing; GLB is for viewing.' },
    ],
  },
  {
    from: 'gltf', to: 'glb', toolId: 'model-3d-convert',
    why: 'A .gltf is often several files (JSON, .bin, textures). GLB packs everything into one file that is easy to upload, email and serve.',
    quality: 'The scene is re-packed into binary glTF. Geometry, materials and hierarchy are unchanged. If the .gltf references external .bin or texture files, those must be available for them to be included.',
    uses: 'Uploading a model to a store or CMS that accepts one file; serving a single asset from a CDN; sending a model to a client.',
    faq: [
      { question: 'Is glTF to GLB lossless?', answer: 'Yes for the data present — GLB is the same glTF content in a binary container.' },
      { question: 'Why is GLB better for the web?', answer: 'One request, no broken relative paths, and faster parsing.' },
      { question: 'My .gltf uses external textures. What happens?', answer: 'They must be available to the converter. Embedded (data-URI) glTF files convert with everything included.' },
      { question: 'Is my model uploaded?', answer: 'No, it stays on your device.' },
    ],
  },
  {
    from: 'glb', to: 'gltf', toolId: 'model-3d-convert',
    why: 'GLB is binary and hard to inspect. glTF is JSON you can read, diff and edit — useful for debugging a model or tweaking materials by hand.',
    quality: 'The same scene is written as glTF JSON. Geometry, materials, hierarchy and animation are unchanged. The binary geometry goes into a separate .bin file, so you download a ZIP containing the .gltf and its .bin — keep them together.',
    uses: 'Debugging why a model looks wrong in three.js; editing material values by hand; checking what a GLB really contains.',
    faq: [
      { question: 'Why convert GLB to glTF?', answer: 'To read and edit the model description as text.' },
      { question: 'Is anything lost?', answer: 'No — glTF and GLB hold the same data in different containers.' },
      { question: 'Can I convert back?', answer: 'Yes, use the glTF to GLB converter.' },
      { question: 'Is it private?', answer: 'The file never leaves your browser.' },
    ],
  },
  {
    from: 'obj', to: 'gltf', toolId: 'model-3d-convert',
    why: 'Move an OBJ into the modern glTF ecosystem while keeping a readable JSON file you can edit.',
    quality: 'Geometry, normals and UVs convert. Without the .mtl file and textures, the model uses a default material.',
    uses: 'Preparing assets for three.js or Babylon.js; converting scan output for web pipelines.',
    faq: [
      { question: 'glTF or GLB?', answer: 'Choose glTF to read or edit the JSON; choose GLB for one-file delivery.' },
      { question: 'Are materials kept?', answer: 'Only if the .mtl information is available; a lone OBJ has none.' },
      { question: 'Is it uploaded?', answer: 'No.' },
      { question: 'Does it work on Mac and Linux?', answer: 'Yes, in any modern browser.' },
    ],
  },
  {
    from: 'stl', to: 'gltf', toolId: 'model-3d-convert',
    why: 'Bring 3D-print geometry into a web or game pipeline that expects glTF.',
    quality: 'The triangles are copied exactly. STL has no colour or UVs, so the glTF gets a default material.',
    uses: 'Loading printable parts in three.js; building an online configurator from printable designs.',
    faq: [
      { question: 'Will the geometry change?', answer: 'No, triangles are preserved.' },
      { question: 'Can I add colour?', answer: 'Yes, edit the material in the glTF JSON or in Blender.' },
      { question: 'Is it uploaded?', answer: 'No, the conversion is local.' },
      { question: 'What units does it use?', answer: 'glTF uses metres; STL is unitless, so check the scale of millimetre models.' },
    ],
  },
  {
    from: 'fbx', to: 'gltf', toolId: 'model-3d-convert',
    why: 'Convert Autodesk FBX into the open glTF standard, as editable JSON for web and engine pipelines.',
    quality: 'Meshes, materials and hierarchy convert; animation and skinning are carried where Assimp can map them. Check complex rigs after conversion.',
    uses: 'Inspecting an FBX asset’s structure; moving game assets into open-source engines like Godot.',
    faq: [
      { question: 'Does Godot support glTF?', answer: 'Yes — glTF is Godot’s recommended import format.' },
      { question: 'Are animations kept?', answer: 'Where Assimp can map them; preview the result.' },
      { question: 'Is FBX uploaded?', answer: 'No.' },
      { question: 'Why do materials look different?', answer: 'glTF uses PBR materials, so FBX shading is approximated.' },
    ],
  },
  {
    from: 'dae', to: 'gltf', toolId: 'model-3d-convert',
    why: 'glTF is the successor to COLLADA at the Khronos Group. Converting keeps your model in an open, actively supported format.',
    quality: 'Scene hierarchy, geometry and basic materials convert. Externally referenced textures need to be available.',
    uses: 'Migrating a COLLADA asset library; importing SketchUp exports into modern engines.',
    faq: [
      { question: 'Is glTF the replacement for COLLADA?', answer: 'Both are Khronos standards; glTF is the one designed for efficient delivery and is where tool support has moved.' },
      { question: 'Will the file be smaller?', answer: 'Usually, because the geometry is stored as binary buffers instead of XML text.' },
      { question: 'Is it uploaded?', answer: 'No.' },
      { question: 'Are cameras and lights kept?', answer: 'The scene nodes are kept; check cameras and lights in your viewer, as support varies.' },
    ],
  },
  {
    from: 'ply', to: 'gltf', toolId: 'model-3d-convert',
    why: 'Take a scanned PLY mesh into glTF for web viewers, engines or further processing.',
    quality: 'Geometry and per-vertex colours convert. Point clouds without faces must be meshed first.',
    uses: 'Scan-to-web pipelines; cultural-heritage viewers; feeding scans to three.js.',
    faq: [
      { question: 'Are vertex colours kept?', answer: 'Yes.' },
      { question: 'Can I convert raw point clouds?', answer: 'Mesh them first in MeshLab or CloudCompare.' },
      { question: 'Is it private?', answer: 'Yes, nothing is uploaded.' },
      { question: 'glTF or GLB for scans?', answer: 'GLB for publishing, glTF for inspection or editing.' },
    ],
  },
  {
    from: '3mf', to: 'gltf', toolId: 'model-3d-convert',
    why: 'Turn a 3MF print project into an open glTF scene for viewers and web tools.',
    quality: 'Object meshes and basic colours convert; print settings and plate data stay behind in the 3MF.',
    uses: 'Displaying print projects in web galleries; loading 3MF designs into Blender via glTF.',
    faq: [
      { question: 'Are print settings kept?', answer: 'No — glTF is for display.' },
      { question: 'Are multi-object 3MF files supported?', answer: 'Yes, each object becomes a node.' },
      { question: 'Is it uploaded?', answer: 'No.' },
      { question: 'Can Blender open the result?', answer: 'Yes, Blender imports glTF natively.' },
    ],
  },
  {
    from: '3ds', to: 'gltf', toolId: 'model-3d-convert',
    why: 'Modernise legacy 3D Studio files into an open, well-supported format you can edit.',
    quality: 'Meshes, hierarchy and material colours convert. Textures referenced by 8.3 filenames need to be available.',
    uses: 'Converting an old asset archive for today’s engines; inspecting legacy models as JSON.',
    faq: [
      { question: 'Why do old 3DS textures fail?', answer: 'They reference separate images with short 8.3 names that are often missing.' },
      { question: 'Will Unity or Godot import the result?', answer: 'Godot imports glTF directly; Unity does with the glTFast package.' },
      { question: 'Is it private?', answer: 'Yes.' },
      { question: 'Is it free?', answer: 'Yes.' },
    ],
  },
];

const BY_SLUG = new Map(PAIRS.map((p) => [`${p.from}-to-${p.to}`, p]));

export const CAD3D_PAIRS: ConvertPair[] = PAIRS.map((p) => ({
  from: p.from,
  to: p.to,
  toolId: p.toolId,
  category: 'convert',
  title: `${p.from.toUpperCase()} → ${p.to.toUpperCase()}`,
  blurb: `Convert ${p.from.toUpperCase()} to ${p.to.toUpperCase()} in your browser — private, no upload, no install.`,
  popular: true,
}));

export function isCad3dPair(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export function cad3dContent(slug: string): ConversionContentData | null {
  const p = BY_SLUG.get(slug);
  if (!p) return null;
  const f = CAD3D_FORMATS[p.from];
  const t = CAD3D_FORMATS[p.to];
  const F = p.from.toUpperCase();
  const T = p.to.toUpperCase();
  return {
    title: `${F} to ${T} converter — free, private, no upload`,
    metaDescription: `Convert ${F} to ${T} in your browser. ${p.why.split('. ')[0]}.`.slice(0, 158),
    intro: `${p.why} This converter runs entirely in your browser: the file is processed on your own device and never uploaded.`,
    whyConvert: p.why,
    howItWorks: `Drop your .${p.from} file above and download the .${p.to}. The conversion engine (${p.toolId === 'cad-convert' ? 'Open CASCADE' : p.toolId === 'model-3d-convert' ? 'Assimp' : 'LibreDWG'}, compiled to WebAssembly) runs inside the page, so it works the same on Windows, macOS, Linux and ChromeOS without installing anything.`,
    qualityNotes: p.to === 'gltf' && !p.quality.includes('ZIP')
      ? `${p.quality} glTF output is a .gltf file plus a .bin file with the geometry, so the download is a ZIP containing both — keep them together.`
      : p.quality,
    useCases: p.uses,
    formatComparison: `${f.name}: ${f.what} Used by: ${f.usedBy}\n\n${t.name}: ${t.what} Used by: ${t.usedBy}`,
    faq: p.faq,
  };
}
