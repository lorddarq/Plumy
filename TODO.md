# Project TODOs

- [x] Create `MonthsScroller` and `MonthColumn` components (skeleton) ✅
- [ ] Integrate scroll sync between months header and timeline rows
- [x] Dynamically measure header+day-row height and align left spacer ✅
- [x] Visual polish: align borders, spacing, and fonts for months and swimlane labels ✅
- [x] Make left `Project Lane` sticky and resizable as a single column ✅
- [x] Add empty spacer above swimlane labels to align with month header+day row ✅
- [x] Move "Add Swimlane" button to bottom of left column ✅
- [x] Refactor `DraggableSwimlaneRow` to render per-month containers (column-based layout) ✅
- [x] Clip tasks per-month so segments render inside the correct month containers ✅
- [ ] Add visible month resizer handle + double-click reset
- [ ] Persist `monthWidths` and `leftColWidth` to `electron-store`
- [ ] Add tests and visual QA page for alignment
- [x] Extract `TaskCard` component for swimlane task cards and add inline rename + per-card color support ✅
- [x] Enable inline re-ordering of swimlane cards (already supported) ✅
- [x] Extract and enable customization for status/category columns (title, color, reorder) ✅

---

Notes:
- The first task scaffolded basic components and wired the header to use `MonthsScroller` so we can iterate visually.
- Mark items as done here as I finish them.
