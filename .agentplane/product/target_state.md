# TARGET STATE

The final MVP-1 must let staff operate the production flow in real life.

## Required qualities
- deterministic
- fast
- low cognitive load
- visually clean
- operationally actionable

## Required logistics object
- universal assembly sheet
- `1 counterparty = 1 sheet`
- one or many destination warehouses per sheet
- matrix-friendly for supervisors
- focus-friendly for pickers
- actor-traceable for penalties and discrepancy investigation

## Required assembly-sheet behavior
- compact and detailed viewing modes for the same sheet
- per-warehouse priority and planned ship date
- SKU x destination warehouse matrix
- row totals and warehouse totals
- partial picking as a first-class state
- underpick reason required when incomplete work is closed
- acting picker captured automatically from authenticated user
- focus mode hides non-target warehouses to reduce wrong-column mistakes

## Required daily flow
plan -> production -> stations -> shipment -> control tower -> recommendations
