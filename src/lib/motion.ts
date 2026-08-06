// Shared spring preset, translated from Apple's damping/response model
// (WWDC 2018 "Designing Fluid Interfaces") into Motion's bounce/duration
// spring API. The rule this enforces consistently instead of every component
// picking its own numbers: add bounce ONLY when the interaction itself carried
// momentum (a tap release, a drag, a flick) — never on a passive enter/exit.

// Press feedback (button/card tap) — snappy and slightly bouncy since it's the
// direct result of a touch, not a passive transition.
export const springPress = { type: 'spring' as const, bounce: 0.25, duration: 0.25 }
