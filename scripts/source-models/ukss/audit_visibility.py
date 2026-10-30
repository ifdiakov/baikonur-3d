# SPDX-License-Identifier: GPL-2.0-or-later
"""Read-only audit of UKSS source node flags and reference relationships.

This script never imports Blender, evaluates MAXScript, edits source geometry,
or assigns visibility. It reads the inspected pinned OLE reader's data-reading
prefix and independently enumerates the source Scene stream. The only output
is ukss_visibility_audit.json. Undocumented flag bits stay undocumented.

Internal stage, invoked with explicit paths by convert.py.
"""
import ast
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import struct
import types


from ukss_config import ROOT, SOURCE, WORK
IMPORTER = WORK / "io_scene_max/import_max.py"
SOURCE_SHA256 = "2e51706e5267564fba9fd6d90262a2fb67f3d84ccfd7c3a002b23895fc704ebb"
IMPORTER_SHA256 = "1b786ebe82d2a1c0df273514af449e8b91430672abafde3de4ee634f2432320d"
OUTPUT = ROOT / "ukss_visibility_audit.json"


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


assert checksum(SOURCE) == SOURCE_SHA256, "Unexpected source file"
assert checksum(IMPORTER) == IMPORTER_SHA256, "Unexpected importer revision"

# Same inspected bounded OLE reader as the source-index audit, without the
# Blender importer, registration functions, scene building, or source scripts.
tree = ast.parse(IMPORTER.read_text())
prefix = []
for statement in tree.body:
    if isinstance(statement, ast.ClassDef) and statement.name == "MaxChunk":
        break
    if isinstance(statement, ast.Import):
        if all(alias.name in {"io", "os", "re", "sys", "zlib", "array", "struct", "math"}
               for alias in statement.names):
            prefix.append(statement)
    elif isinstance(statement, (ast.Assign, ast.FunctionDef, ast.ClassDef)):
        prefix.append(statement)
module = types.ModuleType("audited_ole_data_reader")
exec(compile(ast.Module(body=prefix, type_ignores=[]), "<audited_ole_data_reader>", "exec"), module.__dict__)
with module.ImportMaxFile(str(SOURCE)) as compound:
    data = compound.openstream("Scene").read()


def chunk(offset):
    kind, size = struct.unpack_from("<Hi", data, offset)
    head = 6
    if size == 0:
        size = struct.unpack_from("<q", data, offset + head)[0]
        head += 8
        length = size & 0x7fffffffffffffff
    else:
        length = size & 0x7fffffff
    assert length >= head and offset + length <= len(data)
    return kind, offset + head, offset + length, size < 0


def children(start, end):
    result = []
    while start < end:
        item = chunk(start)
        assert item[2] <= end
        result.append(item)
        start = item[2]
    assert start == end
    return result


root = chunk(0)
items = children(root[1], root[2])
classes = json.loads((ROOT / "ukss_source_classes.json").read_text())


def class_name(scene_index):
    kind = items[scene_index][0]
    return classes[kind]["name"] if 0 <= kind < len(classes) else hex(kind)


def parts(scene_index):
    item = items[scene_index]
    return children(item[1], item[2])


def fields(scene_index):
    return {kind: (start, end, container) for kind, start, end, container in parts(scene_index)}


def raw(scene_index, kind):
    item = fields(scene_index).get(kind)
    return data[item[0]:item[1]] if item else b""


def uints(value):
    assert len(value) % 4 == 0
    return list(struct.unpack("<" + "I" * (len(value) // 4), value))


def references(scene_index):
    sparse = uints(raw(scene_index, 0x2035))
    if sparse:
        assert len(sparse) % 2 == 1
        return dict(zip(sparse[1::2], sparse[2::2]))
    return dict(enumerate(uints(raw(scene_index, 0x2034))))


def material_name(scene_index):
    if scene_index is None:
        return None
    name_container = fields(scene_index).get(0x4000)
    if name_container:
        for kind, start, end, _ in children(name_container[0], name_container[1]):
            if kind == 0x4001:
                return data[start:end].decode("utf-16le").rstrip("\0")
    return class_name(scene_index) + "#" + str(scene_index)


nodes = []
for index in range(len(items)):
    if class_name(index) != "Node":
        continue
    node_fields = fields(index)
    refs = references(index)
    parent_and_flags = uints(raw(index, 0x0960))
    assert len(parent_and_flags) == 2
    flags = parent_and_flags[1]
    bit = bool(flags & 0x800000)
    has_chunk = 0x0978 in node_fields
    assert bit == has_chunk, (index, flags, has_chunk)
    obj = refs.get(1)
    mat = refs.get(3)
    nodes.append({
        "sceneIndex": index,
        "name": raw(index, 0x0962).decode("utf-16le").rstrip("\0"),
        "parentSceneIndex": parent_and_flags[0],
        "objectSceneIndex": obj,
        "objectClass": class_name(obj) if obj is not None else None,
        "references": refs,
        "referenceClasses": {slot: class_name(ref) for slot, ref in refs.items()},
        "materialSceneIndex": mat,
        "materialName": material_name(mat),
        "layerSceneIndex": refs.get(6),
        "rawFlags": {
            "chunk0960SecondUint32": flags,
            "chunk0960SecondUint32Hex": f"0x{flags:08X}",
            "chunk0963Uint32": uints(raw(index, 0x0963)),
            "chunk099CUint32": uints(raw(index, 0x099C)),
            "chunk0978Present": has_chunk,
            "chunk0978RawHex": raw(index, 0x0978).hex(),
            "uninterpretedBit00800000": bit,
        },
        "visibilityState": "unknown-undecoded-source-flags",
    })

assert len(nodes) == 7119
by_index = {node["sceneIndex"]: node for node in nodes}
original_index = json.loads((ROOT / "ukss_source_node_index.json").read_text())["nodes"]
assert [(n["sceneIndex"], n["name"]) for n in nodes] == [(n["sceneIndex"], n["name"]) for n in original_index]
for node, original in zip(nodes, original_index):
    assert node["references"] == {int(k): v for k, v in original["references"].items()}


def flagged(node):
    return node["rawFlags"]["uninterpretedBit00800000"]


def ancestors(node):
    result = []
    parent = node["parentSceneIndex"]
    while parent in by_index:
        assert parent not in result, "Source hierarchy cycle"
        result.append(parent)
        parent = by_index[parent]["parentSceneIndex"]
    return result


def distribution(key):
    total = Counter(key(n) for n in nodes)
    selected = Counter(key(n) for n in nodes if flagged(n))
    return [{"value": item, "flaggedNodeCount": selected[item], "totalNodeCount": count}
            for item, count in sorted(total.items(), key=lambda item: (-selected[item[0]], str(item[0])))]


for node in nodes:
    node["ancestorSceneIndices"] = ancestors(node)
    node["parentName"] = by_index.get(node["parentSceneIndex"], {}).get("name")

layer_indices = sorted({n["layerSceneIndex"] for n in nodes if n["layerSceneIndex"] is not None})
layers = []
for index in layer_indices:
    layers.append({
        "sceneIndex": index,
        "class": class_name(index),
        "nameAscii": raw(index, 0x1010).decode("ascii", errors="replace").rstrip("\0"),
        "nodeCount": sum(n["layerSceneIndex"] == index for n in nodes),
        "rawChunks": [{"kind": f"0x{k:04X}", "isContainer": c,
                       "byteLength": b-a, "hex": data[a:b].hex()} for k, a, b, c in parts(index)],
        "visibilityState": "unknown-undecoded-source-flags",
    })

target_indices = [16523, 522, 28368, 28298, 550, 56877, 28890]
name_pattern = re.compile(r"bak|backup|old|hide|hidden|draft|temp|copy|стар|коп|черно", re.I)
visibility_candidates = [{"sceneIndex": n["sceneIndex"], "name": n["name"],
                          "unexpectedReferences": {slot: ref for slot, ref in n["references"].items()
                                                   if slot not in {0, 1, 3, 6}}}
                         for n in nodes if set(n["references"]) - {0, 1, 3, 6}]
assert not visibility_candidates
all_slots = sorted({slot for node in nodes for slot in node["references"]})
geometry_count = sum(n["objectClass"] != "Dummy" for n in nodes)
flagged_count = sum(flagged(n) for n in nodes)
assert flagged_count == 639 and geometry_count == 5669

primary_sources = [
    {"url": "https://help.autodesk.com/cloudhelp/2023/ENU/Max-Developer-Help/3ds_max_sdk_features/scenes_and_nodes/nodes/nodes_and_references.html",
     "supports": "Node reference roles: transform, object, IK pin, material, visibility controller, image blur, layer. Visibility controller is optional and absent by default. Does not describe MAX binary flag chunks."},
    {"url": "https://help.autodesk.com/cloudhelp/2017/ENU/Max-SDK/cpp_ref/ilayer_8h.html",
     "supports": "NODE_LAYER_REF = 6."},
    {"url": "https://help.autodesk.com/cloudhelp/2026/ENU/MAXDEV-CPP-API-REF/class_i_node.html",
     "supports": "INode exposes GetVisController, GetVisibility, Hide/IsHidden, renderable and visibility APIs. No verified mapping to the observed serialized chunk bits was found."},
    {"url": "https://help.autodesk.com/cloudhelp/2024/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Node-MAXWrapper/Node-Common-Properties-Operators/GUID-00AB0CFA-3190-4A28-A185-4774B684F6D8.html",
     "supports": "Viewport hidden status can derive from node, layer, category, or frozen-object settings; renderability and controller visibility are separate. API properties do not decode the file's raw bit fields."},
    {"url": "https://github.com/nrgsille76/io_scene_max/tree/37db107126f956f7219152671443080360565691",
     "supports": "Audited pinned importer source. It reads the parent index and layer reference but does not restore node hidden/renderable or layer visibility flags."},
]

report = {
    "auditVersion": "ukss-source-visibility-readonly-v1",
    "source": {"path": str(SOURCE), "bytes": SOURCE.stat().st_size, "sha256": SOURCE_SHA256},
    "method": "Independent read-only enumeration of all Node records and exact saved reference maps in the source Scene stream; no source-script execution, Blender modification, scene filtering or geometry mutation.",
    "sourceNodeCount": len(nodes),
    "sourceGeometryNodeCountIncludingEmptyMeshAndRenderableLines": geometry_count,
    "sourceDummyNodeCount": len(nodes) - geometry_count,
    "conclusion": {
        "sourceHiddenOrRenderableFlagsDecoded": False,
        "allSourceNodesProvenVisible": False,
        "canSafelyHideAnyNodeFromThisAudit": False,
        "recommendedRawPolicy": "Preserve all source geometry and identities. Any photo-based museum display filtering must be explicit and separate from the raw recovered asset.",
        "uninterpretedFlag": "0x800000 in the second uint32 of chunk 0x0960 exactly co-occurs with empty chunk 0x0978 on 639 geometry nodes. Its meaning is not established. It must not be interpreted as hidden, selected, frozen, renderable or backup.",
        "raw099CQualification": "Four values occur, differing by bits 0x2000 and 0x40000000; their source meaning is unverified.",
        "raw0963Qualification": "Values correlate exactly with source object class categories, not a demonstrated per-node visibility state: geometry 0x10/0x10; Dummy 0x50/0x50; Line 0x40/0x40.",
        "backupNameQualification": "No audited backup/construction name markers were found; this is not proof that all source objects were intended for rendering.",
    },
    "importerVisibilitySupport": {
        "path": str(IMPORTER), "sha256": IMPORTER_SHA256,
        "upstreamCommit": "37db107126f956f7219152671443080360565691",
        "restoresNodeHidden": False, "restoresNodeRenderable": False,
        "restoresLayerVisibility": False, "restoresVisibilityController": False,
        "evidence": "get_node_parent reads only the first uint32 of 0x0960. get_matrix_mesh_material reads refs 0,1,3,6. No assignments of hide_render/hide_viewport and no interpretation of chunks 0x0963, 0x0978, 0x099C for node visibility exist in the pinned importer.",
    },
    "visibilityControllerAudit": {
        "referenceRolesObserved": {"0": "transform controller", "1": "object or derived object", "3": "material", "6": "layer (official NODE_LAYER_REF = 6)"},
        "allObservedSlots": all_slots,
        "referenceLayoutCounts": {",".join(map(str, k)): v for k, v in Counter(tuple(sorted(n["references"])) for n in nodes).items()},
        "assignedSeparateVisibilityControllerReferenceCount": len(visibility_candidates),
        "assignedSeparateVisibilityControllerReferences": visibility_candidates,
        "nodesWithReferenceSlot4": [n["sceneIndex"] for n in nodes if 4 in n["references"]],
        "nodesWithReferenceSlot5": [n["sceneIndex"] for n in nodes if 5 in n["references"]],
        "interpretation": "All 7119 maps contain only already-identified transform/object/material/layer refs. There are no additional references that could hold the optional node visibility controller, including no refs in slots 4 or 5. This does not determine static hidden, frozen, renderable, layer or category state.",
    },
    "uninterpretedBit00800000": {
        "flaggedNodeCount": flagged_count,
        "sourceGeometryNodeCount": geometry_count,
        "fractionOfGeometryNodes": flagged_count / geometry_count,
        "allFlaggedSourceNodeIds": [n["sceneIndex"] for n in nodes if flagged(n)],
        "byObjectClass": distribution(lambda n: n["objectClass"]),
        "byMaterial": distribution(lambda n: n["materialName"]),
        "byDirectParent": distribution(lambda n: n["parentSceneIndex"]),
        "byTopSourceAncestorOrSelf": distribution(lambda n: n["ancestorSceneIndices"][-1] if n["ancestorSceneIndices"] else n["sceneIndex"]),
        "bordoGroup": {"topGroupSceneIndex": 28436, "topGroupName": "Group611",
                       "nestedGroupSceneIndex": 28461, "nestedGroupName": "Group610",
                       "allBordoNodeIds": [n["sceneIndex"] for n in nodes if n["materialName"] == "Bordo"],
                       "allBordoNodesHaveUninterpretedBit": all(flagged(n) for n in nodes if n["materialName"] == "Bordo"),
                       "qualification": "The bit is shared by many other physical components; it cannot identify a hidden Buran/rocket placeholder by itself."},
    },
    "rawFlagDistributions": {
        "0960SecondUint32": dict(Counter(n["rawFlags"]["chunk0960SecondUint32Hex"] for n in nodes)),
        "0963Uint32Pair": {",".join(f"0x{x:08X}" for x in k): v for k, v in Counter(tuple(n["rawFlags"]["chunk0963Uint32"]) for n in nodes).items()},
        "099CUint32": {",".join(f"0x{x:08X}" for x in k): v for k, v in Counter(tuple(n["rawFlags"]["chunk099CUint32"]) for n in nodes).items()},
    },
    "layers": layers,
    "backupNameMarkerPattern": name_pattern.pattern,
    "backupNameMarkerMatches": [{"sceneIndex": n["sceneIndex"], "name": n["name"]} for n in nodes if name_pattern.search(n["name"])],
    "requestedDistantObjects": [by_index[index] for index in target_indices],
    "primarySources": primary_sources,
    "nodes": nodes,
}
assert checksum(SOURCE) == SOURCE_SHA256, "Source changed during read-only audit"
report["sourceUnchangedAfterReadOnlyAudit"] = True
OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"output": str(OUTPUT), "sourceNodes": len(nodes),
                  "uninterpretedFlaggedNodes": flagged_count,
                  "visibilityControllerReferenceCount": len(visibility_candidates),
                  "sourceLayerCount": len(layers), "sourceUnchanged": True}, ensure_ascii=False))
