// EVA - verifica estrutura glTF 2.0 em GLBs originais
import { readFileSync } from "node:fs";
const files = ["javali_vb4","atlas_t3","modulo_v7","rastro_av4","janus_station"];
let passed = 0;
for (const name of files) {
  const path = "assets-src/vehicles/" + name + ".glb";
  const bytes = readFileSync(path);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const assert = (ok, message) => { if (!ok) throw new Error(name + ": " + message); };
  assert(dv.getUint32(0, true) === 0x46546c67, "not glTF binary magic");
  assert(dv.getUint32(4, true) === 2, "not glTF 2.0");
  assert(dv.getUint32(8, true) === bytes.length, "wrong total byte length");
  const jlen = dv.getUint32(12, true), off = 20 + jlen;
  assert(dv.getUint32(16, true) === 0x4e4f534a, "missing JSON chunk");
  assert(off + 8 <= bytes.length, "truncated GLB");
  assert(dv.getUint32(off + 4, true) === 0x004e4942, "missing BIN chunk");
  const gltf = JSON.parse(bytes.subarray(20,off).toString("utf8"));
  assert(gltf.asset?.version === "2.0", "not glTF JSON 2.0");
  assert(Array.isArray(gltf.meshes) && gltf.meshes.length > 10, "missing separate model parts");
  assert(Array.isArray(gltf.materials) && gltf.materials.length > 0, "missing materials");
  const binLen = dv.getUint32(off,true);
  assert(off + 8 + binLen === bytes.length, "BIN size mismatch");
  for (const bv of gltf.bufferViews || []) {
    assert(bv.byteOffset + bv.byteLength <= binLen, "bufferView out of bounds");
  }
  for (const [i, mesh] of gltf.meshes.entries()) {
    for (const primitive of mesh.primitives) {
      assert(gltf.accessors[primitive.indices], "missing indices on mesh " + i);
      assert(gltf.accessors[primitive.attributes.POSITION], "missing position accessor on mesh " + i);
      assert(gltf.materials[primitive.material], "missing material on mesh " + i);
    }
  }
  console.log("OK", name, gltf.meshes.length + " submeshes", gltf.extras.triangles + " tris");
  passed++;
}
console.log(passed + "/" + files.length + " GLBs structurally valid.");
// Nota: teste estrutural NÃO substitui glTF Validator da Khronos nem inspeção visual no navegador.
