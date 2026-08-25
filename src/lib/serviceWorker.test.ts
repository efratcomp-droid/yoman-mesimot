import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './serviceWorker'

const update = vi.fn()
const register = vi.fn()
const reload = vi.fn()

type Handlers = Record<string, Array<() => void>>

let containerHandlers: Handlers
let documentHandlers: Handlers
let windowHandlers: Handlers
let controller: object | null

function record(handlers: Handlers, type: string, handler: () => void) {
  handlers[type] = [...(handlers[type] ?? []), handler]
}

function fire(handlers: Handlers, type: string) {
  for (const handler of handlers[type] ?? []) {
    handler()
  }
}

/**
 * Listeners are captured rather than attached: the module registers on the
 * real document and window, and left in place they would pile up across tests
 * and answer each other's events.
 */
function captureListeners() {
  containerHandlers = {}
  documentHandlers = {}
  windowHandlers = {}

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      get controller() {
        return controller
      },
      register,
      addEventListener: (type: string, handler: () => void) =>
        record(containerHandlers, type, handler),
    },
  })

  vi.spyOn(document, 'addEventListener').mockImplementation((type, handler) =>
    record(documentHandlers, type, handler as () => void),
  )
  vi.spyOn(window, 'addEventListener').mockImplementation((type, handler) =>
    record(windowHandlers, type, handler as () => void),
  )
}

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => state,
  })
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

function at(millis: number) {
  vi.spyOn(Date, 'now').mockReturnValue(millis)
}

/** Lets the registration promise chain settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('registerServiceWorker', () => {
  beforeEach(() => {
    update.mockReset().mockResolvedValue(undefined)
    register.mockReset().mockResolvedValue({ update })
    reload.mockReset()
    controller = {}
    setReadyState('complete')
    setVisibility('visible')
    captureListeners()
    at(1_000_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers the worker under the app base path', async () => {
    registerServiceWorker({ reload })
    await flush()

    const base = import.meta.env.BASE_URL
    expect(register).toHaveBeenCalledWith(`${base}sw.js`, { scope: base })
  })

  it('waits for load when the document is still parsing', async () => {
    setReadyState('loading')
    registerServiceWorker({ reload })
    await flush()
    expect(register).not.toHaveBeenCalled()

    fire(windowHandlers, 'load')
    await flush()
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('checks for an update as soon as it registers', async () => {
    registerServiceWorker({ reload })
    await flush()

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('checks again when the app returns to the foreground', async () => {
    registerServiceWorker({ reload })
    await flush()
    update.mockClear()

    at(1_100_000)
    fire(documentHandlers, 'visibilitychange')

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not check while the app is in the background', async () => {
    registerServiceWorker({ reload })
    await flush()
    update.mockClear()

    setVisibility('hidden')
    at(1_100_000)
    fire(documentHandlers, 'visibilitychange')
    fire(windowHandlers, 'focus')

    expect(update).not.toHaveBeenCalled()
  })

  it('collapses the visibilitychange and focus pair into one check', async () => {
    registerServiceWorker({ reload })
    await flush()
    update.mockClear()

    // Both fire on the same foreground, so the clock does not move between them.
    at(1_100_000)
    fire(documentHandlers, 'visibilitychange')
    fire(windowHandlers, 'focus')

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('survives an update check that fails offline', async () => {
    update.mockRejectedValue(new Error('offline'))

    registerServiceWorker({ reload })
    await flush()

    expect(reload).not.toHaveBeenCalled()
  })

  it('survives a registration that fails outright', async () => {
    register.mockRejectedValue(new Error('no worker'))

    registerServiceWorker({ reload })
    await flush()

    expect(update).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads when a new worker takes over a page that already had one', async () => {
    registerServiceWorker({ reload })
    await flush()

    fire(containerHandlers, 'controllerchange')

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads only once even if control changes again', async () => {
    registerServiceWorker({ reload })
    await flush()

    fire(containerHandlers, 'controllerchange')
    fire(containerHandlers, 'controllerchange')

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload on a first install, where no stale page is on screen', async () => {
    controller = null

    registerServiceWorker({ reload })
    await flush()
    fire(containerHandlers, 'controllerchange')

    expect(reload).not.toHaveBeenCalled()
  })

  it('still reloads for a version that lands during the install session', async () => {
    // The first visit loads uncontrolled, the worker claims the page, and a
    // new version can arrive before the tab is ever reloaded.
    controller = null

    registerServiceWorker({ reload })
    await flush()
    fire(containerHandlers, 'controllerchange')
    expect(reload).not.toHaveBeenCalled()

    fire(containerHandlers, 'controllerchange')

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when service workers are unavailable', () => {
    // @ts-expect-error removing an optional platform API for the test
    delete navigator.serviceWorker

    expect(() => registerServiceWorker({ reload })).not.toThrow()
    expect(register).not.toHaveBeenCalled()
  })
})
