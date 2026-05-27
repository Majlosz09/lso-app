import React from 'react'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockBack = jest.fn()

module.exports = {
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  router: { replace: mockReplace, push: mockPush, back: mockBack },
  Redirect: () => null,
}
