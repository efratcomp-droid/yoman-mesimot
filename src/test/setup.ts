import '@testing-library/jest-dom/vitest'
// jsdom ships no IndexedDB, so without this the offline cache and the action
// queue could only ever be tested through mocks — which is how a broken write
// path stayed invisible.
import 'fake-indexeddb/auto'
