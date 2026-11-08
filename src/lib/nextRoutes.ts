import { parseHash, resolvePath } from '../routes'

export function resolveNextLocation(pathname: string, hash: string) {
  return hash.startsWith('#/') ? parseHash(hash) : resolvePath(pathname)
}
