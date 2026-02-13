function _mergeNamespaces(n, m) {
  for (var i = 0; i < m.length; i++) {
    const e = m[i];
    if (typeof e !== "string" && !Array.isArray(e)) {
      for (const k in e) {
        if (k !== "default" && !(k in n)) {
          const d = Object.getOwnPropertyDescriptor(e, k);
          if (d) {
            Object.defineProperty(n, k, d.get ? d : {
              enumerable: true,
              get: () => e[k]
            });
          }
        }
      }
    }
  }
  return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: "Module" }));
}
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var applePhotosJs = { exports: {} };
const NULL = Symbol.for("NULL_SYMBOL");
const lib = {
  get: () => {
    return Symbol.for("NULL_SYMBOL");
  },
  is: (ref) => {
    return typeof ref !== "undefined" && ref === null || ref === NULL;
  },
  to: (ref) => {
    if (lib.is(ref)) return lib.get();
    return ref;
  },
  isRef: (ref) => {
    return ref === NULL;
  },
  isEmpty: (ref) => {
    return lib.isNullRef(ref) || ref === "";
  },
  emptyType: (ref) => {
    if (typeof ref === "undefined") return "IS_UNDEFINED";
    if (ref === "") return "IS_EMPTY";
    if (ref === NULL) return "IS_NULLREF";
    if (ref === null) return "IS_NULL";
    return "NOT_EMPTY";
  }
};
applePhotosJs.exports = () => {
  return NULL;
};
var lib_1 = applePhotosJs.exports.lib = lib;
var isNull = applePhotosJs.exports.isNull = lib.is;
var isNullRef = applePhotosJs.exports.isNullRef = lib.isRef;
var toNull = applePhotosJs.exports.toNull = lib.to;
var NULL_1 = applePhotosJs.exports.NULL = NULL;
var applePhotosJsExports = applePhotosJs.exports;
const index = /* @__PURE__ */ getDefaultExportFromCjs(applePhotosJsExports);
const index$1 = /* @__PURE__ */ _mergeNamespaces({
  __proto__: null,
  NULL: NULL_1,
  default: index,
  isNull,
  isNullRef,
  lib: lib_1,
  toNull
}, [applePhotosJsExports]);
export {
  index$1 as i
};
//# sourceMappingURL=index-C2QpSo0k.js.map
