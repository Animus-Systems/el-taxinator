/**
 * Compatibility shim for next/headers.
 *
 * Server-only module. In the SPA, cookies/headers are managed via
 * the browser directly. These stubs exist so that transitive imports
 * from server actions don't crash at module load time.
 */

export async function cookies() {
  return {
    get(_name: string) {
      // Read from document.cookie
      const value = document.cookie
        .split("; ")
        .find((row) => row.startsWith(_name + "="))
        ?.split("=")[1]
      return value ? { name: _name, value } : undefined
    },
    set(_name: string, _value: string) {
      document.cookie = `${_name}=${_value}; path=/`
    },
    delete(_name: string) {
      document.cookie = `${_name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    },
    getAll() {
      return document.cookie.split("; ").map((c) => {
        const [name, value] = c.split("=")
        return { name, value }
      })
    },
    has(_name: string) {
      return document.cookie.includes(_name + "=")
    },
  }
}

export async function headers() {
  return new Headers()
}
