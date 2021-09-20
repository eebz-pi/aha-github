export default function singleOrArrayMap(thingy, callback) {
  if (Array.isArray(thingy)) {
    return thingy.map(thing => callback(thing))
  } else {
    return callback(thingy)
  }
}
