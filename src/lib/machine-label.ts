// Machine display label — NAME FIRST, code after in brackets:
//   "Mesin Sealer Toples [CST1]"
//
// Owner's convention (2026-08): workers recognise machines by NAME, not code —
// a bare "CST1" in a report forced a "which machine is that?" round trip. The
// code stays (bracketed, trailing) because it's still the precise identifier
// QC/maintenance write on the machine itself.
//
// One shared helper on purpose: this exact format used to be copy-pasted at
// ~28 call sites, which is why flipping the order took a whole-app sweep
// instead of a one-line change. Every new machine label goes through here.
export function machineLabel(
  name: string | null | undefined,
  code: string | null | undefined,
): string {
  const n = (name ?? '').trim()
  const c = (code ?? '').trim()
  if (n && c) return `${n} [${c}]`
  return n || c
}
