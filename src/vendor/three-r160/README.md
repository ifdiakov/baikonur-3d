# Three.js runtime subset

Unmodified files from the `three` npm package, version **0.160.1**.
Upstream: https://github.com/mrdoob/three.js
Package: https://www.npmjs.com/package/three/v/0.160.1
License: MIT; the original `LICENSE` is included.

The museum serves this small runtime subset from its own origin so scene startup
does not depend on a third-party JavaScript CDN. The import map resolves `three`
to `build/three.module.js` and `three/addons/` to `examples/jsm/` here.

Included modules: the Three.js engine, OrbitControls, GLTFLoader, and its
BufferGeometryUtils dependency. The model loaders already use the separate
local `../meshopt_decoder-v1.mjs` decoder. No upstream source is modified.

## Original file SHA-256 values

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `build/three.module.js` | 1272972 | `76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495` |
| `examples/jsm/controls/OrbitControls.js` | 30973 | `7aa4372a5ec60b49988edde81014c7361740a57962d032003ca33301c1f4edd5` |
| `examples/jsm/loaders/GLTFLoader.js` | 108522 | `d073b438e6a07e1359741dd5d6c76c953420cc0d4fd84eb1bdde94315540e6a3` |
| `examples/jsm/utils/BufferGeometryUtils.js` | 31906 | `9be041e96308775d00e2695cc607645b9a9b64fd7c0e759dd8f7c00a8d92becb` |
| `LICENSE` | 1081 | `852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d` |
